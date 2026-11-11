import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { z } from "zod";
import { config } from "./config.ts";
import { db, insert, uid, now, audit, transact } from "./db.ts";
import * as schemas from "./schemas.ts";
import { workflowRouter, getWorkspace } from "./workflows.ts";
import { loadDocument, removeDocument, storeDocument } from "./storage.ts";
const scrypt = promisify(scryptCallback);
type SessionUser = { id: string; name: string; email: string; csrf: string };
declare global {
  namespace Express {
    interface Request {
      user: SessionUser;
    }
  }
}
export const app = express();
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.COOKIE_SECURE ? [] : null,
      },
    },
    strictTransportSecurity: config.COOKIE_SECURE ? undefined : false,
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const id = (req: Request, key = "id") => String(req.params[key]);
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const cookies = (req: Request) =>
  Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .filter((x) => x.includes("="))
      .map((x) => {
        const at = x.indexOf("=");
        return [x.slice(0, at).trim(), x.slice(at + 1)];
      }),
  );
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: config.COOKIE_SECURE,
  path: "/",
};
const auth = (req: Request, _res: Response, next: NextFunction) => {
  const token = cookies(req).vaidya_session;
  const user = token
    ? db
        .prepare(
          "SELECT u.id,u.name,u.email,s.csrf FROM sessions s JOIN users u ON u.id=s.userId WHERE token=? AND expires>?",
        )
        .get(hash(token), Date.now())
    : null;
  if (!user)
    return next(
      Object.assign(new Error("Please sign in to continue"), { status: 401 }),
    );
  req.user = user as SessionUser;
  next();
};
app.get("/api/health", (_req, res) =>
  res.json({
    status: "ok",
    database:
      db.prepare("SELECT 1 AS ok").get()?.ok === 1 ? "ready" : "unavailable",
  }),
);
app.post(
  "/api/auth/login",
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 15,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  async (req, res) => {
    const { email, password } = z
      .strictObject({ email: z.email(), password: z.string().min(1).max(256) })
      .parse(req.body);
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(email.toLowerCase()) as
      | { id: string; name: string; email: string; hash: string; salt: string }
      | undefined;
    const supplied = (await scrypt(
      password,
      user?.salt ?? "dummy-salt",
      64,
    )) as Buffer;
    if (!user || !timingSafeEqual(supplied, Buffer.from(user.hash, "hex")))
      return fail(401, "Email or password is incorrect");
    const token = randomBytes(32).toString("hex"),
      csrf = randomBytes(24).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    insert("sessions", {
      token: hash(token),
      userId: user.id,
      csrf,
      expires: Date.now() + 12 * 60 * 60_000,
    });
    res
      .cookie("vaidya_session", token, {
        ...cookieOptions,
        maxAge: 12 * 60 * 60_000,
      })
      .json({
        user: { id: user.id, name: user.name, email: user.email },
        csrf,
      });
  },
);
app.use("/api", auth);
app.use("/api", (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  const allowed = new Set([config.APP_ORIGIN]);
  if (config.NODE_ENV !== "production") {
    allowed.add("http://127.0.0.1:5173");
    allowed.add("http://localhost:3001");
    allowed.add("http://127.0.0.1:3001");
  }
  if (origin && !allowed.has(origin))
    return next(
      Object.assign(new Error("Request origin is not allowed"), {
        status: 403,
      }),
    );
  if (req.get("x-csrf-token") !== req.user.csrf)
    return next(
      Object.assign(
        new Error("Security token expired. Refresh and try again."),
        { status: 403 },
      ),
    );
  next();
});
app.get("/api/auth/me", (req, res) =>
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email },
    csrf: req.user.csrf,
  }),
);
app.use("/api", workflowRouter);
app.post("/api/auth/logout", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE token=?").run(
    hash(cookies(req).vaidya_session ?? ""),
  );
  res.clearCookie("vaidya_session", cookieOptions).json({ ok: true });
});
app.get("/api/schemas", (_req, res) =>
  res.json(
    Object.fromEntries(
      Object.entries(schemas)
        .filter(([name]) => name.endsWith("Schema"))
        .map(([name, value]) => [name, z.toJSONSchema(value)]),
    ),
  ),
);
const getPatient = (patientId: string) => {
  const p = db.prepare("SELECT * FROM patients WHERE id=?").get(patientId);
  if (!p) return fail(404, "Patient not found");
  return { ...p, favourite: !!p.favourite } as Record<string, unknown>;
};
function inStay(patientId: string, dates: string[]) {
  const p = getPatient(patientId);
  if (
    dates.some(
      (d) => d < String(p.admissionDate) || d > String(p.dischargeDate),
    )
  )
    fail(400, "Choose dates within the admission and discharge dates");
}
app.get("/api/patients", (req, res) => {
  const search = z
    .string()
    .max(100)
    .parse(req.query.search ?? "");
  res.json(
    db
      .prepare(
        "SELECT * FROM patients WHERE name LIKE ? OR id LIKE ? ORDER BY createdAt DESC LIMIT 200",
      )
      .all(`%${search}%`, `%${search}%`)
      .map((p) => ({ ...p, favourite: !!p.favourite })),
  );
});
app.post("/api/patients", (req, res) => {
  const data = schemas.patientSchema.parse(req.body),
    patientId = uid();
  if (data.room && data.room !== "Unassigned")
    fail(
      400,
      "Create the admission first, then use Assign room to reserve a bed.",
    );
  data.room = "Unassigned";
  transact(() => {
    insert("patients", {
      id: patientId,
      ...data,
      favourite: Number(data.favourite),
      createdAt: now(),
    });
    audit(patientId, "Patient admitted", data.name, req.user.name);
  });
  res.status(201).json(getPatient(patientId));
});
app.put("/api/patients/:id", (req, res) => {
  const existing = getPatient(id(req));
  const data = schemas.patientSchema.parse(req.body);
  if (
    existing.status === "Discharged" &&
    (data.admissionDate !== existing.admissionDate ||
      data.dischargeDate !== existing.dischargeDate)
  )
    fail(409, "Finalized admission and discharge dates cannot be changed.");
  if (data.room !== existing.room)
    fail(409, "Use Assign room or Transfer room to change accommodation");
  const outside = db
    .prepare(
      "SELECT date FROM assignments WHERE patientId=? AND status<>'Cancelled' UNION SELECT date FROM vitals WHERE patientId=?",
    )
    .all(id(req), id(req))
    .some(
      (r) =>
        String(r.date) < data.admissionDate ||
        String(r.date) > data.dischargeDate,
    );
  if (outside)
    fail(409, "The new stay dates would exclude existing therapies or vitals");
  const stay = db
    .prepare("SELECT * FROM room_stays WHERE patientId=? AND status='Active'")
    .get(id(req));
  if (
    db
      .prepare(
        "SELECT id FROM room_stays WHERE patientId=? AND status<>'Cancelled' AND (startDate<? OR (status='Completed' AND endDate>?)) LIMIT 1",
      )
      .get(id(req), data.admissionDate, data.dischargeDate)
  )
    fail(409, "The new dates would exclude an existing room stay.");
  if (
    stay &&
    data.dischargeDate !== existing.dischargeDate &&
    db
      .prepare("SELECT id FROM bill_items WHERE source=?")
      .get("room:" + stay.recordId)
  )
    fail(
      409,
      "Reconcile the existing accommodation invoice before changing its charged dates.",
    );
  const values = { ...data, favourite: Number(data.favourite) };
  transact(() => {
    db.prepare(
      `UPDATE patients SET ${Object.keys(values)
        .map((k) => `${k}=?`)
        .join(",")} WHERE id=?`,
    ).run(...Object.values(values), String(existing.id));
    if (stay && data.dischargeDate !== existing.dischargeDate) {
      db.prepare("UPDATE room_stays SET endDate=? WHERE id=?").run(
        data.dischargeDate,
        String(stay.id),
      );
      db.prepare("UPDATE records SET quantity=? WHERE id=?").run(
        1 +
          Math.round(
            (Date.parse(data.dischargeDate) -
              Date.parse(String(stay.startDate))) /
              86400000,
          ),
        String(stay.recordId),
      );
    }
    audit(id(req), "Patient details updated", data.name, req.user.name);
  });
  res.json(getPatient(id(req)));
});
app.get("/api/patients/:id/workspace", (req, res) =>
  res.json(getWorkspace(id(req))),
);
app.post("/api/patients/:id/vitals", (req, res) => {
  const patientId = id(req);
  const data = schemas.vitalSchema.parse(req.body);
  inStay(patientId, [data.date]);
  const p = getPatient(patientId);
  if (p.vitalsMode === "legacy") data.session = "Daily";
  else if (data.session === "Daily")
    fail(400, "Choose Morning, Noon or Evening in session mode");
  const existing = db
    .prepare("SELECT id FROM vitals WHERE patientId=? AND date=? AND session=?")
    .get(patientId, data.date, data.session);
  const vitalId = existing ? String(existing.id) : uid();
  const values = {
    id: vitalId,
    patientId,
    ...data,
    height: data.height ?? null,
    weight: data.weight ?? null,
    temperature: data.temperature ?? null,
    pulse: data.pulse ?? null,
    rr: data.rr ?? null,
    painScore: data.painScore ?? null,
    fbs: data.fbs ?? null,
    ppbs: data.ppbs ?? null,
    rbs: data.rbs ?? null,
    spo2: data.spo2 ?? null,
  };
  transact(() => {
    if (existing) db.prepare("DELETE FROM vitals WHERE id=?").run(vitalId);
    insert("vitals", values);
    audit(
      patientId,
      "Vitals recorded",
      `${data.date} · ${data.session}`,
      req.user.name,
    );
  });
  res.status(201).json(values);
});
app.delete("/api/patients/:id/vitals/:entryId", (req, res) => {
  const result = transact(() => {
    const r = db
      .prepare("DELETE FROM vitals WHERE id=? AND patientId=?")
      .run(id(req, "entryId"), id(req));
    if (!r.changes) fail(404, "Vital record not found");
    audit(id(req), "Vitals deleted", id(req, "entryId"), req.user.name);
    return r;
  });
  res.json({ deleted: Number(result.changes) });
});
app.post("/api/patients/:id/notes", (req, res) => {
  const data = schemas.noteSchema.parse(req.body);
  inStay(id(req), [data.date]);
  const note = {
    id: uid(),
    patientId: id(req),
    ...data,
    author: req.user.name,
    createdAt: now(),
  };
  transact(() => {
    insert("notes", note);
    audit(
      id(req),
      "Session note added",
      `${data.date} · ${data.session}`,
      req.user.name,
    );
  });
  res.status(201).json(note);
});
app.post("/api/patients/:id/records", (req, res) => {
  getPatient(id(req));
  const data = schemas.recordSchema.parse(req.body);
  const record = { id: uid(), patientId: id(req), ...data, createdAt: now() };
  transact(() => {
    insert("records", record);
    audit(id(req), `${data.kind} added`, data.title, req.user.name);
  });
  res.status(201).json(record);
});
app.put("/api/patients/:id/records/:entryId", (req, res) => {
  const data = schemas.recordSchema.parse(req.body);
  transact(() => {
    const result = db
      .prepare(
        `UPDATE records SET ${Object.keys(data)
          .map((k) => `${k}=?`)
          .join(",")} WHERE id=? AND patientId=?`,
      )
      .run(...Object.values(data), id(req, "entryId"), id(req));
    if (!result.changes) fail(404, "Record not found");
    audit(id(req), `${data.kind} updated`, data.title, req.user.name);
  });
  res.json({ ok: true });
});
app.delete("/api/patients/:id/records/:entryId", (req, res) => {
  transact(() => {
    if (
      !db
        .prepare("DELETE FROM records WHERE id=? AND patientId=?")
        .run(id(req, "entryId"), id(req)).changes
    )
      fail(404, "Record not found");
    audit(id(req), "Care record deleted", id(req, "entryId"), req.user.name);
  });
  res.json({ ok: true });
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
app.post("/api/patients/:id/documents", upload.single("file"), async (req, res) => {
  getPatient(id(req));
  const f = req.file;
  if (!f) fail(400, "Select a PDF, PNG or JPEG document");
  const file = f!;
  let mime = "",
    ext = "";
  if (file.buffer.subarray(0, 5).toString() === "%PDF-") {
    mime = "application/pdf";
    ext = ".pdf";
  } else if (
    file.buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    mime = "image/png";
    ext = ".png";
  } else if (
    file.buffer[0] === 255 &&
    file.buffer[1] === 216 &&
    file.buffer[2] === 255
  ) {
    mime = "image/jpeg";
    ext = ".jpg";
  } else fail(400, "Only genuine PDF, PNG and JPEG files are supported");
  const document = {
    id: uid(),
    patientId: id(req),
    name: file.originalname.replace(/[\x00-\x1f]/g, "").slice(0, 180),
    mime,
    size: file.size,
    filename: uid() + ext,
    createdAt: now(),
  };
  const storagePath = `${document.patientId}/${document.filename}`;
  document.filename = storagePath;
  await storeDocument(storagePath, file.buffer, mime);
  try {
    transact(() => {
      insert("documents", document);
      audit(id(req), "Document uploaded", document.name, req.user.name);
    });
  } catch (e) {
    await removeDocument(storagePath);
    throw e;
  }
  const { filename: _, ...publicDoc } = document;
  res.status(201).json(publicDoc);
});
app.get("/api/patients/:id/documents/:entryId", async (req, res) => {
  const doc = db
    .prepare("SELECT * FROM documents WHERE id=? AND patientId=?")
    .get(id(req, "entryId"), id(req));
  if (!doc) fail(404, "Document not found");
  const data = await loadDocument(String(doc!.filename));
  if (!data) fail(404, "Document file unavailable");
  res.type(String(doc!.mime)).attachment(String(doc!.name)).send(data);
});
app.delete("/api/patients/:id/documents/:entryId", async (req, res) => {
  const doc = db
    .prepare("SELECT * FROM documents WHERE id=? AND patientId=?")
    .get(id(req, "entryId"), id(req));
  if (!doc) fail(404, "Document not found");
  transact(() => {
    db.prepare("DELETE FROM documents WHERE id=?").run(id(req, "entryId"));
    audit(id(req), "Document deleted", String(doc!.name), req.user.name);
  });
  await removeDocument(String(doc!.filename));
  res.json({ ok: true });
});
app.get("/api/inventory", (_req, res) =>
  res.json(db.prepare("SELECT * FROM inventory ORDER BY name").all()),
);
app.post("/api/inventory", (req, res) => {
  const data = schemas.inventorySchema.parse(req.body);
  const item = { id: uid(), ...data };
  transact(() => {
    insert("inventory", item);
    audit(null, "Inventory item added", data.name, req.user.name);
  });
  res.status(201).json(item);
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API endpoint not found" }),
);
if (existsSync(resolve("dist/index.html"))) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({
      error: "Please check the form inputs",
      fields: err.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
  if (err instanceof multer.MulterError)
    return res.status(400).json({
      error:
        err.code === "LIMIT_FILE_SIZE"
          ? "Maximum upload size is 10 MB"
          : err.message,
    });
  const error = err as { status?: number; message?: string; type?: string };
  const status =
    error.status ?? (error.type === "entity.parse.failed" ? 400 : 500);
  if (status >= 500) console.error("Request failed:", error.message);
  res.status(status).json({
    error:
      status >= 500
        ? "The request could not be completed"
        : (error.message ?? "Request failed"),
  });
});
