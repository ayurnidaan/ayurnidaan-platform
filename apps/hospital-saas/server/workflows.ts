import { Router, type Request } from "express";
import { z } from "zod";
import { randomBytes, scrypt as rawScrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db, insert, uid, now, audit, transact } from "./db.ts";
import * as s from "./schemas.ts";
import type {
  Patient,
  Bill,
  CareRecord,
  PrescriptionDetails,
  TherapyEstimate,
  Room,
} from "../shared/types.ts";

export const workflowRouter = Router();
const fail = (status: number, message: string): never => {
  throw Object.assign(new Error(message), { status });
};
const param = (req: Request, key = "id") => String(req.params[key]);
const cents = (n: unknown) => Math.round(Number(n) * 100);
const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dateAdd = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
const allSessions = ["Morning", "Noon", "Evening"];
export function patientRow(patientId: string) {
  const row = db.prepare("SELECT * FROM patients WHERE id=?").get(patientId);
  if (!row) fail(404, "Patient not found");
  return { ...row!, favourite: !!row!.favourite } as unknown as Patient;
}
function activePatient(patientId: string) {
  const p = patientRow(patientId);
  if (p.status === "Discharged")
    fail(
      409,
      "This patient has been discharged. Open a new admission to schedule further care.",
    );
  return p;
}
function checkDates(p: Patient, dates: string[]) {
  if (dates.some((date) => date < p.admissionDate || date > p.dischargeDate))
    fail(400, "Choose dates within the admission and discharge dates");
}
function recordRows(patientId: string) {
  return db
    .prepare(
      "SELECT * FROM records WHERE patientId=? ORDER BY date DESC,createdAt DESC",
    )
    .all(patientId)
    .map((row) => {
      const { metadata, ...record } = row;
      return {
        ...record,
        ...(record.kind === "prescription"
          ? { prescription: JSON.parse(String(metadata)) }
          : {}),
      };
    }) as unknown as CareRecord[];
}
export function getBills(patientId: string): Bill[] {
  return db
    .prepare("SELECT * FROM bills WHERE patientId=? ORDER BY createdAt DESC,id")
    .all(patientId)
    .map((row) => ({
      ...row,
      paidAmount: Number(row.paidCents) / 100,
      balance:
        row.status === "Cancelled"
          ? 0
          : Math.max(0, cents(row.amount) - Number(row.paidCents)) / 100,
      items: db
        .prepare(
          "SELECT id,description,quantity,unitPriceCents/100.0 AS unitPrice,amountCents/100.0 AS amount,source FROM bill_items WHERE billId=? ORDER BY rowid",
        )
        .all(String(row.id)),
      payments: db
        .prepare(
          "SELECT id,amountCents/100.0 AS amount,method,reference,date,createdAt FROM payments WHERE billId=? ORDER BY createdAt DESC",
        )
        .all(String(row.id)),
    })) as unknown as Bill[];
}
export function getEstimates(patientId: string): TherapyEstimate[] {
  return db
    .prepare(
      "SELECT * FROM estimate_batches WHERE patientId=? AND EXISTS(SELECT 1 FROM estimate_lines WHERE batchId=estimate_batches.id) ORDER BY createdAt DESC",
    )
    .all(patientId)
    .map((row) => {
      const items = db
        .prepare(
          "SELECT l.id,l.therapyId,t.name,l.days,l.unitPriceCents/100.0 AS unitPrice FROM estimate_lines l JOIN therapies t ON t.id=l.therapyId WHERE batchId=? ORDER BY l.rowid",
        )
        .all(String(row.id))
        .map((i) => ({
          ...i,
          amount:
            Number(i.days) *
            Number(i.unitPrice) *
            (row.session === "All" ? 3 : 1),
        }));
      return {
        ...row,
        items,
        total: items.reduce((sum, i) => sum + cents(i.amount), 0) / 100,
      };
    }) as unknown as TherapyEstimate[];
}
export function getWorkspace(patientId: string) {
  return {
    patient: patientRow(patientId),
    vitals: db
      .prepare(
        "SELECT * FROM vitals WHERE patientId=? ORDER BY date DESC,time DESC,rowid DESC",
      )
      .all(patientId),
    assignments: db
      .prepare(
        "SELECT a.*,t.name,t.duration,a.unitPriceCents/100.0 AS price FROM assignments a JOIN therapies t ON t.id=a.therapyId WHERE patientId=? ORDER BY date,session,t.name",
      )
      .all(patientId),
    notes: db
      .prepare("SELECT * FROM notes WHERE patientId=? ORDER BY createdAt DESC")
      .all(patientId),
    records: recordRows(patientId),
    documents: db
      .prepare(
        "SELECT id,patientId,name,mime,size,createdAt FROM documents WHERE patientId=? ORDER BY createdAt DESC",
      )
      .all(patientId),
    bills: getBills(patientId),
    estimates: getEstimates(patientId),
    roomStays: db
      .prepare(
        "SELECT s.*,r.name,r.type FROM room_stays s JOIN rooms r ON r.id=s.roomId WHERE patientId=? ORDER BY startDate DESC,s.rowid DESC",
      )
      .all(patientId),
    audit: db
      .prepare(
        "SELECT * FROM audit WHERE patientId=? ORDER BY createdAt DESC,rowid DESC LIMIT 100",
      )
      .all(patientId),
  };
}

type Charge = {
  description: string;
  quantity: number;
  unitPriceCents: number;
  source?: string;
};
function createInvoice(
  patientId: string,
  title: string,
  items: Charge[],
  requestId: string | null = null,
) {
  if (requestId) {
    const existing = db
      .prepare("SELECT id,patientId FROM bills WHERE requestId=?")
      .get(requestId);
    if (existing) {
      if (existing.patientId !== patientId)
        fail(409, "This request has already been used");
      return getBills(patientId).find((b) => b.id === existing.id)!;
    }
  }
  const amountCents = items.reduce(
    (sum, i) => sum + Math.round(i.quantity * i.unitPriceCents),
    0,
  );
  if (amountCents <= 0 || amountCents > 1000000000)
    fail(400, "Invoice total must be positive and no more than ₹10,000,000");
  const billId = uid(),
    number = `INV-${new Date().getFullYear()}-${String(Number(db.prepare("SELECT COUNT(*) AS n FROM bills").get()!.n) + 1).padStart(5, "0")}`;
  for (const item of items)
    if (
      item.source &&
      db.prepare("SELECT id FROM bill_items WHERE source=?").get(item.source)
    )
      fail(409, "One or more selected charges have already been invoiced");
  insert("bills", {
    id: billId,
    patientId,
    title,
    amount: amountCents / 100,
    status: "Unpaid",
    createdAt: now(),
    number,
    paidCents: 0,
    requestId,
  });
  for (const i of items)
    insert("bill_items", {
      id: uid(),
      billId,
      description: i.description,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      amountCents: Math.round(i.quantity * i.unitPriceCents),
      source: i.source ?? null,
    });
  return getBills(patientId).find((b) => b.id === billId)!;
}
function addPayment(
  patientId: string,
  billId: string,
  data: z.infer<typeof s.paymentSchema>,
  author: string,
) {
  const bill = db
    .prepare("SELECT * FROM bills WHERE id=? AND patientId=?")
    .get(billId, patientId);
  if (!bill) fail(404, "Invoice not found");
  const replay = db
    .prepare("SELECT billId FROM payments WHERE id=?")
    .get(data.requestId);
  if (replay) {
    if (replay.billId !== billId)
      fail(409, "This payment request has already been used");
    return;
  }
  if (bill!.status === "Cancelled") fail(409, "This invoice is void");
  const amount = cents(data.amount),
    remaining = cents(bill!.amount) - Number(bill!.paidCents);
  if (amount > remaining) fail(409, "Payment exceeds the outstanding balance");
  if (data.date > today())
    fail(400, "A recorded payment cannot be dated in the future");
  insert("payments", {
    id: data.requestId,
    billId,
    amountCents: amount,
    method: data.method,
    reference: data.reference,
    date: data.date,
    author,
    createdAt: now(),
  });
  const paid = Number(bill!.paidCents) + amount;
  db.prepare("UPDATE bills SET paidCents=?,status=? WHERE id=?").run(
    paid,
    paid === cents(bill!.amount) ? "Paid" : "Partially paid",
    billId,
  );
  audit(
    patientId,
    "Payment recorded",
    `${bill!.number} · ₹${data.amount} · ${data.method}`,
    author,
  );
}
const directoryQuery = z.object({
  search: z.string().max(100).default(""),
  status: z
    .enum(["All", "Admitted", "Discharged", "Favourites"])
    .default("All"),
  sort: z.enum(["Newest", "Name", "Admission"]).default("Newest"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});
function directoryRows(query: z.infer<typeof directoryQuery>, paginate = true) {
  const clauses: string[] = [],
    values: (string | number)[] = [];
  if (query.search) {
    clauses.push(
      "(name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')",
    );
    const value = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
    values.push(value, value, value);
  }
  if (query.status === "Favourites") clauses.push("favourite=1");
  else if (query.status !== "All") {
    clauses.push("status=?");
    values.push(query.status);
  }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const total = Number(
    db.prepare(`SELECT COUNT(*) AS n FROM patients ${where}`).get(...values)!.n,
  );
  const order = {
    Newest: "createdAt DESC,id",
    Name: "name COLLATE NOCASE,id",
    Admission: "admissionDate DESC,id",
  }[query.sort];
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(total / query.pageSize)),
  );
  return {
    items: db
      .prepare(
        `SELECT * FROM patients ${where} ORDER BY ${order}${paginate ? " LIMIT ? OFFSET ?" : ""}`,
      )
      .all(
        ...values,
        ...(paginate ? [query.pageSize, (page - 1) * query.pageSize] : []),
      )
      .map((p) => ({ ...p, favourite: !!p.favourite })),
    total,
    page,
    pageSize: query.pageSize,
  };
}
workflowRouter.get("/patients/directory", (req, res) =>
  res.json(directoryRows(directoryQuery.parse(req.query))),
);
workflowRouter.get("/patients/directory.csv", (req, res) => {
  const rows = directoryRows(directoryQuery.parse(req.query), false).items;
  const csv = (v: unknown) => {
    let value = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(value)) value = "'" + value;
    return '"' + value.replaceAll('"', '""') + '"';
  };
  const columns = [
    "id",
    "name",
    "age",
    "gender",
    "phone",
    "admissionDate",
    "dischargeDate",
    "status",
    "physician",
    "room",
  ];
  res
    .attachment("patient-directory.csv")
    .type("text/csv")
    .send(
      "\uFEFF" +
        [
          columns,
          ...rows.map((r) =>
            columns.map((k) => (r as unknown as Record<string, unknown>)[k]),
          ),
        ]
          .map((r) => r.map(csv).join(","))
          .join("\r\n"),
    );
});
workflowRouter.get("/patients/:id/export", (req, res) => {
  const workspace = getWorkspace(param(req));
  res
    .attachment(`patient-${param(req)}.json`)
    .json({ exportedAt: now(), ...workspace });
});
workflowRouter.get("/dashboard", (req, res) => {
  const date = s.dateSchema.parse(req.query.date ?? today());
  res.json({
    date,
    activePatients: Number(
      db
        .prepare("SELECT COUNT(*) AS n FROM patients WHERE status='Admitted'")
        .get()!.n,
    ),
    dischargedPatients: Number(
      db
        .prepare("SELECT COUNT(*) AS n FROM patients WHERE status='Discharged'")
        .get()!.n,
    ),
    outstanding:
      Number(
        db
          .prepare(
            "SELECT COALESCE(SUM(CAST(ROUND(amount*100) AS INTEGER)-paidCents),0) AS n FROM bills WHERE status<>'Cancelled'",
          )
          .get()!.n,
      ) / 100,
    collected:
      Number(
        db
          .prepare(
            "SELECT COALESCE(SUM(amountCents),0) AS n FROM payments WHERE date=?",
          )
          .get(date)!.n,
      ) / 100,
    completed: Number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM assignments WHERE date=? AND status='Completed'",
        )
        .get(date)!.n,
    ),
    scheduled: Number(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM assignments WHERE date=? AND status='Scheduled'",
        )
        .get(date)!.n,
    ),
    queue: db
      .prepare(
        "SELECT a.*,t.name,t.duration,a.unitPriceCents/100.0 AS price,p.name AS patientName FROM assignments a JOIN therapies t ON t.id=a.therapyId JOIN patients p ON p.id=a.patientId WHERE a.date=? AND a.status<>'Cancelled' ORDER BY CASE a.session WHEN 'Morning' THEN 0 WHEN 'Noon' THEN 1 ELSE 2 END,p.name,t.name",
      )
      .all(date),
    lowStock: db
      .prepare(
        "SELECT * FROM inventory WHERE stock<=reorderLevel ORDER BY stock,name LIMIT 30",
      )
      .all(),
    followUps: db
      .prepare(
        "SELECT * FROM patients WHERE nextVisit<>'' AND nextVisit<=? ORDER BY nextVisit,name LIMIT 30",
      )
      .all(date),
    activity: db
      .prepare(
        "SELECT * FROM audit ORDER BY createdAt DESC,rowid DESC LIMIT 20",
      )
      .all(),
  });
});
workflowRouter.get("/practice", (_req, res) => {
  const { id: _, ...practice } = db
    .prepare("SELECT * FROM practice WHERE id=1")
    .get()!;
  res.json(practice);
});
workflowRouter.put("/practice", (req, res) => {
  const data = s.practiceSchema.parse(req.body);
  transact(() => {
    db.prepare(
      "UPDATE practice SET name=?,tagline=?,phone=?,address=? WHERE id=1",
    ).run(data.name, data.tagline, data.phone, data.address);
    audit(null, "Practice details updated", data.name, req.user.name);
  });
  res.json(data);
});
const scrypt = promisify(rawScrypt);
workflowRouter.put("/auth/profile", async (req, res) => {
  const data = z
    .strictObject({
      name: z.string().trim().min(2).max(100),
      email: z.email().transform((v) => v.toLowerCase()),
      currentPassword: z.string().max(256).default(""),
      newPassword: z
        .union([z.literal(""), z.string().min(12).max(256)])
        .default(""),
    })
    .parse(req.body);
  const old = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id)!;
  let passwordHash = String(old.hash),
    salt = String(old.salt);
  if (data.email !== old.email || data.newPassword) {
    const supplied = (await scrypt(
      data.currentPassword,
      String(old.salt),
      64,
    )) as Buffer;
    if (!timingSafeEqual(supplied, Buffer.from(String(old.hash), "hex")))
      fail(400, "Current password is incorrect");
    if (data.newPassword) {
      salt = randomBytes(16).toString("hex");
      passwordHash = (
        (await scrypt(data.newPassword, salt, 64)) as Buffer
      ).toString("hex");
    }
  }
  if (
    db
      .prepare("SELECT id FROM users WHERE lower(email)=? AND id<>?")
      .get(data.email, req.user.id)
  )
    fail(409, "This email address is already in use");
  transact(() => {
    db.prepare("UPDATE users SET name=?,email=?,hash=?,salt=? WHERE id=?").run(
      data.name,
      data.email,
      passwordHash,
      salt,
      req.user.id,
    );
    if (data.newPassword || data.email !== old.email)
      db.prepare("DELETE FROM sessions WHERE userId=? AND csrf<>?").run(
        req.user.id,
        req.user.csrf,
      );
    audit(null, "Clinician profile updated", data.name, req.user.name);
  });
  res.json({ id: req.user.id, name: data.name, email: data.email });
});

workflowRouter.get("/therapies", (req, res) => {
  const all = req.query.all === "true";
  res.json(
    db
      .prepare(
        `SELECT * FROM therapies ${all ? "" : "WHERE active=1"} ORDER BY name`,
      )
      .all()
      .map((t) => ({ ...t, active: !!t.active })),
  );
});
workflowRouter.post("/therapies", (req, res) => {
  const data = s.therapySchema.parse(req.body);
  if (
    db
      .prepare("SELECT id FROM therapies WHERE lower(name)=lower(?)")
      .get(data.name)
  )
    fail(409, "A therapy with this name already exists");
  const therapy = { id: uid(), ...data, active: Number(data.active) };
  transact(() => {
    insert("therapies", therapy);
    audit(null, "Therapy added", data.name, req.user.name);
  });
  res.status(201).json({ ...therapy, active: !!therapy.active });
});
workflowRouter.put("/therapies/:id", (req, res) => {
  const data = s.therapySchema.parse(req.body);
  if (
    db
      .prepare("SELECT id FROM therapies WHERE lower(name)=lower(?) AND id<>?")
      .get(data.name, param(req))
  )
    fail(409, "A therapy with this name already exists");
  transact(() => {
    if (
      !db
        .prepare(
          "UPDATE therapies SET name=?,category=?,price=?,duration=?,active=? WHERE id=?",
        )
        .run(
          data.name,
          data.category,
          data.price,
          data.duration,
          Number(data.active),
          param(req),
        ).changes
    )
      fail(404, "Therapy not found");
    audit(null, "Therapy updated", data.name, req.user.name);
  });
  res.json({ ok: true });
});
workflowRouter.post("/patients/:id/assignments", (req, res) => {
  const data = s.assignmentSchema.parse(req.body),
    p = activePatient(param(req));
  checkDates(p, data.dates);
  const prices = new Map(
    db
      .prepare("SELECT id,price FROM therapies WHERE active=1")
      .all()
      .map((t) => [String(t.id), cents(t.price)]),
  );
  if (data.therapyIds.some((t) => !prices.has(t)))
    fail(400, "Select an active therapy from the catalog");
  let created = 0;
  transact(() => {
    for (const date of new Set(data.dates))
      for (const session of new Set(data.sessions))
        for (const therapyId of new Set(data.therapyIds)) {
          const old = db
            .prepare(
              "SELECT id,status FROM assignments WHERE patientId=? AND date=? AND session=? AND therapyId=?",
            )
            .get(p.id, date, session, therapyId);
          if (old?.status === "Cancelled") {
            db.prepare(
              "UPDATE assignments SET status='Scheduled',unitPriceCents=?,estimateId=NULL WHERE id=?",
            ).run(prices.get(therapyId)!, String(old.id));
            created++;
          } else if (!old) {
            insert("assignments", {
              id: uid(),
              patientId: p.id,
              date,
              session,
              therapyId,
              status: "Scheduled",
              unitPriceCents: prices.get(therapyId)!,
              estimateId: null,
            });
            created++;
          }
        }
    audit(p.id, "Therapies scheduled", `${created} assignments`, req.user.name);
  });
  res.status(201).json({ created });
});
function protectedCharge(assignmentId: string) {
  return (
    !!db
      .prepare("SELECT id FROM bill_items WHERE source=?")
      .get("therapy:" + assignmentId) ||
    !!db
      .prepare(
        "SELECT a.id FROM assignments a JOIN estimate_batches e ON e.id=a.estimateId WHERE a.id=? AND e.invoiceId IS NOT NULL",
      )
      .get(assignmentId)
  );
}
workflowRouter.patch("/patients/:id/assignments/:entryId", (req, res) => {
  const { status } = z
    .strictObject({ status: z.enum(["Scheduled", "Completed", "Cancelled"]) })
    .parse(req.body);
  const row = db
    .prepare("SELECT * FROM assignments WHERE id=? AND patientId=?")
    .get(param(req, "entryId"), param(req));
  if (!row) fail(404, "Therapy assignment not found");
  if (status !== "Completed" && protectedCharge(String(row!.id)))
    fail(
      409,
      "This therapy is already invoiced and cannot be reopened or cancelled",
    );
  if (patientRow(param(req)).status === "Discharged" && status === "Scheduled")
    fail(409, "Discharged cases cannot be scheduled");
  transact(() => {
    db.prepare("UPDATE assignments SET status=? WHERE id=?").run(
      status,
      String(row!.id),
    );
    audit(
      param(req),
      `Therapy ${status.toLowerCase()}`,
      String(row!.id),
      req.user.name,
    );
  });
  res.json({ ok: true });
});
workflowRouter.delete("/patients/:id/assignments/:entryId", (req, res) => {
  if (protectedCharge(param(req, "entryId")))
    fail(409, "An invoiced therapy cannot be deleted");
  transact(() => {
    if (
      !db
        .prepare("DELETE FROM assignments WHERE id=? AND patientId=?")
        .run(param(req, "entryId"), param(req)).changes
    )
      fail(404, "Assignment not found");
    audit(param(req), "Therapy removed", param(req, "entryId"), req.user.name);
  });
  res.json({ ok: true });
});
workflowRouter.post("/patients/:id/estimates", (req, res) => {
  activePatient(param(req));
  const data = s.estimateSchema.parse(req.body);
  const result = transact(() => {
    const batch = uid();
    insert("estimate_batches", {
      id: batch,
      patientId: param(req),
      session: data.session,
      status: "Draft",
      scheduledAt: "",
      invoiceId: null,
      createdAt: now(),
    });
    for (const item of data.items) {
      const t = db
        .prepare("SELECT * FROM therapies WHERE id=? AND active=1")
        .get(item.therapyId);
      if (!t) fail(400, "Select an active therapy");
      const recordId = uid(),
        amount =
          Number(t!.price) * item.days * (data.session === "All" ? 3 : 1);
      insert("records", {
        id: recordId,
        patientId: param(req),
        kind: "estimate",
        title: String(t!.name),
        detail: `${item.days} days · ${data.session}`,
        date: today(),
        status: "Draft",
        quantity: item.days,
        amount,
        session: data.session,
        createdAt: now(),
      });
      insert("estimate_lines", {
        id: uid(),
        batchId: batch,
        recordId,
        therapyId: item.therapyId,
        days: item.days,
        unitPriceCents: cents(t!.price),
      });
    }
    const estimate = getEstimates(param(req)).find((e) => e.id === batch)!;
    audit(
      param(req),
      "Therapy estimate created",
      `₹${estimate.total}`,
      req.user.name,
    );
    return { total: estimate.total, batch, estimate };
  });
  res.status(201).json(result);
});
workflowRouter.post("/patients/:id/estimates/:entryId/schedule", (req, res) => {
  const { startDate } = z
    .strictObject({ startDate: s.dateSchema })
    .parse(req.body);
  const p = activePatient(param(req));
  const result = transact(() => {
    const estimate = getEstimates(p.id).find(
      (e) => e.id === param(req, "entryId"),
    );
    if (!estimate) fail(404, "Estimate not found");
    if (estimate!.scheduledAt)
      fail(409, "This estimate has already been scheduled");
    const sessions =
      estimate!.session === "All" ? allSessions : [estimate!.session];
    for (const line of estimate!.items)
      checkDates(p, [startDate, dateAdd(startDate, line.days - 1)]);
    let created = 0;
    for (const line of estimate!.items)
      for (let day = 0; day < line.days; day++)
        for (const session of sessions) {
          const date = dateAdd(startDate, day);
          const existing = db
            .prepare(
              "SELECT id,estimateId,status FROM assignments WHERE patientId=? AND date=? AND session=? AND therapyId=?",
            )
            .get(p.id, date, session, line.therapyId);
          if (existing) {
            if (
              (existing.estimateId && existing.estimateId !== estimate!.id) ||
              protectedCharge(String(existing.id))
            )
              fail(
                409,
                "A selected session belongs to another estimate or invoice",
              );
            db.prepare(
              "UPDATE assignments SET estimateId=?,status=CASE WHEN status='Cancelled' THEN 'Scheduled' ELSE status END WHERE id=?",
            ).run(estimate!.id, String(existing.id));
          } else {
            insert("assignments", {
              id: uid(),
              patientId: p.id,
              date,
              session,
              therapyId: line.therapyId,
              status: "Scheduled",
              unitPriceCents: cents(line.unitPrice),
              estimateId: estimate!.id,
            });
            created++;
          }
        }
    db.prepare(
      "UPDATE estimate_batches SET scheduledAt=?,status='Scheduled' WHERE id=?",
    ).run(startDate, estimate!.id);
    db.prepare(
      "UPDATE records SET status='Scheduled' WHERE id IN(SELECT recordId FROM estimate_lines WHERE batchId=?)",
    ).run(estimate!.id);
    audit(
      p.id,
      "Estimate scheduled",
      `${startDate} · ${created} new sessions`,
      req.user.name,
    );
    return { created };
  });
  res.status(201).json(result);
});
workflowRouter.post("/patients/:id/estimates/:entryId/invoice", (req, res) => {
  patientRow(param(req));
  const result = transact(() => {
    const estimate = getEstimates(param(req)).find(
      (e) => e.id === param(req, "entryId"),
    );
    if (!estimate) fail(404, "Estimate not found");
    if (estimate!.invoiceId)
      return getBills(param(req)).find((b) => b.id === estimate!.invoiceId)!;
    const billed = db
      .prepare(
        "SELECT a.id FROM assignments a JOIN bill_items i ON i.source='therapy:'||a.id WHERE a.estimateId=? LIMIT 1",
      )
      .get(estimate!.id);
    if (billed)
      fail(
        409,
        "Some sessions are already invoiced. Invoice the remaining completed care instead.",
      );
    const bill = createInvoice(
      param(req),
      "Therapy plan estimate",
      estimate!.items.map((line) => ({
        description: `${line.name} · ${line.days} days · ${estimate!.session}`,
        quantity: line.days * (estimate!.session === "All" ? 3 : 1),
        unitPriceCents: cents(line.unitPrice),
        source: "estimate:" + line.id,
      })),
    );
    db.prepare("UPDATE estimate_batches SET invoiceId=? WHERE id=?").run(
      bill.id,
      estimate!.id,
    );
    audit(param(req), "Estimate invoiced", bill.number, req.user.name);
    return bill;
  });
  res.status(201).json(result);
});

workflowRouter.post("/patients/:id/prescriptions", (req, res) => {
  activePatient(param(req));
  const data = s.prescriptionSchema.parse(req.body);
  checkDates(patientRow(param(req)), [data.date]);
  const item = data.inventoryId
    ? db.prepare("SELECT * FROM inventory WHERE id=?").get(data.inventoryId)
    : null;
  if (data.inventoryId && !item) fail(400, "Medicine is not in inventory");
  const metadata: PrescriptionDetails = {
    inventoryId: data.inventoryId,
    dose: data.dose,
    frequency: data.frequency,
    days: data.days,
    instructions: data.instructions,
    dispensedQuantity: 0,
  };
  const record = {
    id: uid(),
    patientId: param(req),
    kind: "prescription",
    title: item ? String(item.name) : data.name,
    detail: `${data.dose} · ${data.frequency} · ${data.days} days${data.instructions ? "\n" + data.instructions : ""}`,
    date: data.date,
    status: "Active",
    quantity: data.quantity,
    amount: 0,
    session: data.frequency,
    createdAt: now(),
    metadata: JSON.stringify(metadata),
  };
  transact(() => {
    insert("records", record);
    audit(param(req), "Prescription added", record.title, req.user.name);
  });
  res.status(201).json({ id: record.id });
});
workflowRouter.put("/patients/:id/prescriptions/:entryId", (req, res) => {
  const data = s.prescriptionSchema.parse(req.body);
  const record = db
    .prepare(
      "SELECT * FROM records WHERE id=? AND patientId=? AND kind='prescription'",
    )
    .get(param(req, "entryId"), param(req));
  if (!record) fail(404, "Prescription not found");
  const old = JSON.parse(String(record!.metadata)) as PrescriptionDetails;
  if (
    old.dispensedQuantity > 0 &&
    (data.inventoryId !== old.inventoryId ||
      data.quantity < old.dispensedQuantity)
  )
    fail(
      409,
      "Keep the dispensed medicine and at least the quantity already issued",
    );
  if (
    data.inventoryId &&
    !db.prepare("SELECT id FROM inventory WHERE id=?").get(data.inventoryId)
  )
    fail(400, "Medicine is not in inventory");
  const metadata = { ...data, dispensedQuantity: old.dispensedQuantity || 0 };
  transact(() => {
    db.prepare(
      "UPDATE records SET title=?,detail=?,date=?,quantity=?,session=?,metadata=? WHERE id=?",
    ).run(
      data.name,
      `${data.dose} · ${data.frequency} · ${data.days} days${data.instructions ? "\n" + data.instructions : ""}`,
      data.date,
      data.quantity,
      data.frequency,
      JSON.stringify(metadata),
      param(req, "entryId"),
    );
    audit(param(req), "Prescription updated", data.name, req.user.name);
  });
  res.json({ ok: true });
});
workflowRouter.post(
  "/patients/:id/prescriptions/:entryId/dispense",
  (req, res) => {
    const data = s.dispenseSchema.parse(req.body);
    patientRow(param(req));
    const result = transact(() => {
      const existing = db
        .prepare("SELECT id,patientId FROM bills WHERE requestId=?")
        .get(data.requestId);
      if (existing) {
        if (existing.patientId !== param(req))
          fail(409, "This request has already been used");
        return getBills(param(req)).find((b) => b.id === existing.id)!;
      }
      const record = db
        .prepare(
          "SELECT * FROM records WHERE id=? AND patientId=? AND kind='prescription'",
        )
        .get(param(req, "entryId"), param(req));
      if (!record) fail(404, "Prescription not found");
      const meta = JSON.parse(String(record!.metadata)) as PrescriptionDetails;
      if (!meta.inventoryId)
        fail(
          409,
          "Edit this prescription and link it to an inventory medicine before dispensing",
        );
      if (
        data.quantity >
        Number(record!.quantity) - (meta.dispensedQuantity || 0)
      )
        fail(409, "Quantity exceeds the remaining prescribed quantity");
      const item = db
        .prepare("SELECT * FROM inventory WHERE id=?")
        .get(meta.inventoryId);
      if (!item) fail(404, "Inventory medicine not found");
      if (Number(item!.stock) < data.quantity)
        fail(
          409,
          "Insufficient stock. Adjust the quantity or receive stock first.",
        );
      if (Number(item!.price) <= 0)
        fail(409, "Set a positive unit price before dispensing");
      const bill = createInvoice(
        param(req),
        `Medicine · ${record!.title}`,
        [
          {
            description: String(record!.title),
            quantity: data.quantity,
            unitPriceCents: cents(item!.price),
            source: "dispense:" + data.requestId,
          },
        ],
        data.requestId,
      );
      db.prepare("UPDATE inventory SET stock=ROUND(stock-?,6) WHERE id=?").run(
        data.quantity,
        meta.inventoryId,
      );
      meta.dispensedQuantity = (meta.dispensedQuantity || 0) + data.quantity;
      db.prepare("UPDATE records SET metadata=?,status=? WHERE id=?").run(
        JSON.stringify(meta),
        meta.dispensedQuantity >= Number(record!.quantity)
          ? "Completed"
          : "Active",
        String(record!.id),
      );
      insert("stock_movements", {
        id: data.requestId,
        inventoryId: meta.inventoryId,
        patientId: param(req),
        delta: -data.quantity,
        reason: `Dispensed ${record!.title} · ${bill.number}`,
        author: req.user.name,
        createdAt: now(),
      });
      audit(
        param(req),
        "Medicine dispensed",
        `${record!.title} · ${data.quantity} ${item!.unit} · ${bill.number}`,
        req.user.name,
      );
      return bill;
    });
    res.status(201).json(result);
  },
);
workflowRouter.post("/inventory/:id/adjustments", (req, res) => {
  const data = s.stockAdjustmentSchema.parse(req.body);
  transact(() => {
    const old = db
      .prepare("SELECT inventoryId FROM stock_movements WHERE id=?")
      .get(data.requestId);
    if (old) {
      if (old.inventoryId !== param(req))
        fail(409, "This adjustment request was already used");
      return;
    }
    const item = db
      .prepare("SELECT * FROM inventory WHERE id=?")
      .get(param(req));
    if (!item) fail(404, "Inventory item not found");
    if (Number(item!.stock) + data.delta < 0)
      fail(409, "Stock cannot be reduced below zero");
    db.prepare("UPDATE inventory SET stock=ROUND(stock+?,6) WHERE id=?").run(
      data.delta,
      param(req),
    );
    insert("stock_movements", {
      id: data.requestId,
      inventoryId: param(req),
      patientId: null,
      delta: data.delta,
      reason: data.reason,
      author: req.user.name,
      createdAt: now(),
    });
    audit(
      null,
      "Stock adjusted",
      `${item!.name} · ${data.delta} · ${data.reason}`,
      req.user.name,
    );
  });
  res.json({ ok: true });
});
workflowRouter.get("/inventory/:id/movements", (req, res) => {
  if (!db.prepare("SELECT id FROM inventory WHERE id=?").get(param(req)))
    fail(404, "Inventory item not found");
  res.json(
    db
      .prepare(
        "SELECT * FROM stock_movements WHERE inventoryId=? ORDER BY createdAt DESC,rowid DESC LIMIT 100",
      )
      .all(param(req)),
  );
});
workflowRouter.put("/inventory/:id", (req, res) => {
  const data = s.inventorySchema.parse(req.body);
  transact(() => {
    const item = db
      .prepare("SELECT * FROM inventory WHERE id=?")
      .get(param(req));
    if (!item) fail(404, "Inventory item not found");
    db.prepare(
      "UPDATE inventory SET name=?,stock=?,unit=?,price=?,reorderLevel=? WHERE id=?",
    ).run(
      data.name,
      data.stock,
      data.unit,
      data.price,
      data.reorderLevel,
      param(req),
    );
    if (Number(item!.stock) !== data.stock)
      insert("stock_movements", {
        id: uid(),
        inventoryId: param(req),
        patientId: null,
        delta: data.stock - Number(item!.stock),
        reason: "Stock count correction",
        author: req.user.name,
        createdAt: now(),
      });
    audit(null, "Inventory updated", data.name, req.user.name);
  });
  res.json({ ok: true });
});

workflowRouter.post("/patients/:id/invoices", (req, res) => {
  patientRow(param(req));
  const data = s.invoiceSchema.parse(req.body);
  const bill = transact(() => {
    const bill = createInvoice(
      param(req),
      data.title,
      data.items.map((i) => ({ ...i, unitPriceCents: cents(i.unitPrice) })),
      data.requestId,
    );
    audit(param(req), "Invoice created", bill.number, req.user.name);
    return bill;
  });
  res.status(201).json(bill);
});
workflowRouter.post("/patients/:id/invoices/from-care", (req, res) => {
  patientRow(param(req));
  const data = z
    .strictObject({
      includeAccommodation: z.boolean().default(false),
      requestId: z.uuid(),
    })
    .parse(req.body);
  const bill = transact(() => {
    const replay = db
      .prepare("SELECT id,patientId FROM bills WHERE requestId=?")
      .get(data.requestId);
    if (replay) {
      if (replay.patientId !== param(req)) fail(409, "Request already used");
      return getBills(param(req)).find((b) => b.id === replay.id)!;
    }
    const rows = db
      .prepare(
        "SELECT a.*,t.name FROM assignments a JOIN therapies t ON t.id=a.therapyId LEFT JOIN estimate_batches e ON e.id=a.estimateId WHERE a.patientId=? AND a.status='Completed' AND e.invoiceId IS NULL AND NOT EXISTS(SELECT 1 FROM bill_items WHERE source='therapy:'||a.id) ORDER BY date,session",
      )
      .all(param(req));
    const charges: Charge[] = rows.map((a) => ({
      description: `${a.name} · ${a.date} · ${a.session}`,
      quantity: 1,
      unitPriceCents: Number(a.unitPriceCents),
      source: "therapy:" + a.id,
    }));
    if (data.includeAccommodation) {
      for (const r of db
        .prepare(
          "SELECT * FROM records WHERE patientId=? AND kind='accommodation' AND status<>'Cancelled' AND NOT EXISTS(SELECT 1 FROM bill_items WHERE source='room:'||records.id)",
        )
        .all(param(req)))
        if (Number(r.amount) > 0)
          charges.push({
            description: String(r.title) + " · accommodation",
            quantity: Number(r.quantity),
            unitPriceCents: cents(r.amount),
            source: "room:" + r.id,
          });
    }
    if (!charges.length)
      fail(
        409,
        "There are no uninvoiced completed therapies or selected room charges",
      );
    const bill = createInvoice(
      param(req),
      "Completed care & accommodation",
      charges,
      data.requestId,
    );
    audit(param(req), "Care charges invoiced", bill.number, req.user.name);
    return bill;
  });
  res.status(201).json(bill);
});
workflowRouter.post("/patients/:id/invoices/:entryId/payments", (req, res) => {
  const data = s.paymentSchema.parse(req.body);
  transact(() =>
    addPayment(param(req), param(req, "entryId"), data, req.user.name),
  );
  res
    .status(201)
    .json(getBills(param(req)).find((b) => b.id === param(req, "entryId")));
});
workflowRouter.post("/patients/:id/invoices/:entryId/void", (req, res) => {
  transact(() => {
    const bill = db
      .prepare("SELECT * FROM bills WHERE id=? AND patientId=?")
      .get(param(req, "entryId"), param(req));
    if (!bill) fail(404, "Invoice not found");
    if (Number(bill!.paidCents) > 0)
      fail(409, "An invoice with payments cannot be voided");
    if (
      db
        .prepare(
          "SELECT id FROM bill_items WHERE billId=? AND source LIKE 'dispense:%'",
        )
        .get(param(req, "entryId"))
    )
      fail(
        409,
        "A dispensed-medicine invoice cannot be voided because the medicine has been issued.",
      );
    db.prepare(
      "UPDATE bill_items SET source='void:'||?||':'||source WHERE billId=? AND source IS NOT NULL",
    ).run(param(req, "entryId"), param(req, "entryId"));
    db.prepare(
      "UPDATE estimate_batches SET invoiceId=NULL WHERE invoiceId=?",
    ).run(param(req, "entryId"));
    db.prepare("UPDATE bills SET status='Cancelled' WHERE id=?").run(
      param(req, "entryId"),
    );
    audit(param(req), "Invoice voided", String(bill!.number), req.user.name);
  });
  res.json({ ok: true });
});
workflowRouter.patch("/patients/:id/notes/:entryId", (req, res) => {
  const { text } = z
    .strictObject({ text: z.string().trim().min(1).max(3000) })
    .parse(req.body);
  const note = db
    .prepare("SELECT * FROM notes WHERE id=? AND patientId=?")
    .get(param(req, "entryId"), param(req));
  if (!note) fail(404, "Session note not found");
  transact(() => {
    db.prepare("UPDATE notes SET text=?,author=? WHERE id=?").run(
      text,
      req.user.name,
      param(req, "entryId"),
    );
    audit(
      param(req),
      "Session note corrected",
      `${note!.date} ${note!.session} · Previous entry: ${note!.text}`,
      req.user.name,
    );
  });
  res.json({ ok: true });
});
workflowRouter.put("/patients/:id/records/:entryId", (req, _res, next) => {
  const record = db
    .prepare("SELECT * FROM records WHERE id=? AND patientId=?")
    .get(param(req, "entryId"), param(req));
  if (
    record?.kind === "accommodation" &&
    db
      .prepare("SELECT id FROM room_stays WHERE recordId=?")
      .get(String(record.id))
  )
    fail(409, "Use the room assignment workflow to change accommodation");
  if (record?.kind === "discharge" && record.status === "Final")
    fail(409, "The final handover remains in the patient record");
  if (
    record?.kind === "prescription" &&
    Number(JSON.parse(String(record.metadata)).dispensedQuantity) > 0
  )
    fail(409, "Use Edit prescription to preserve issued quantities");
  next();
});
workflowRouter.post("/patients/:id/bills", (req, res) => {
  patientRow(param(req));
  const data = s.billSchema.parse(req.body);
  const bill = transact(() => {
    const b = createInvoice(param(req), data.title, [
      {
        description: data.title,
        quantity: 1,
        unitPriceCents: cents(data.amount),
      },
    ]);
    if (data.status === "Paid")
      addPayment(
        param(req),
        b.id,
        {
          amount: b.amount,
          method: "Cash",
          reference: "Recorded with invoice",
          date: today(),
          requestId: uid(),
        },
        req.user.name,
      );
    audit(param(req), "Bill created", b.number, req.user.name);
    return getBills(param(req)).find((v) => v.id === b.id)!;
  });
  res.status(201).json(bill);
});
workflowRouter.patch("/patients/:id/bills/:entryId", (req, res) => {
  const { status } = z
    .strictObject({ status: z.enum(["Paid", "Unpaid"]) })
    .parse(req.body);
  transact(() => {
    const bill = getBills(param(req)).find(
      (b) => b.id === param(req, "entryId"),
    );
    if (!bill) fail(404, "Bill not found");
    if (status === "Unpaid" && bill!.paidAmount > 0)
      fail(409, "Recorded payments cannot be erased by changing a status");
    if (status === "Paid" && bill!.balance > 0)
      addPayment(
        param(req),
        bill!.id,
        {
          amount: bill!.balance,
          method: "Cash",
          reference: "Recorded payment",
          date: today(),
          requestId: uid(),
        },
        req.user.name,
      );
  });
  res.json({ ok: true });
});

function getRooms(from: string, to: string, exclude = ""): Room[] {
  return db
    .prepare("SELECT * FROM rooms ORDER BY name")
    .all()
    .map((room) => {
      type OccupancyStay = {
        patientId: string;
        startDate: string;
        endDate: string;
        status: string;
        patientStatus: string;
        patientDischargeDate: string;
      };
      const stays = (
        db
          .prepare(
            "SELECT s.patientId,s.startDate,s.endDate,s.status,p.status AS patientStatus,p.dischargeDate AS patientDischargeDate FROM room_stays s JOIN patients p ON p.id=s.patientId WHERE s.roomId=? AND s.patientId<>? AND s.status<>'Cancelled' AND s.startDate<=? AND (s.status='Active' OR s.endDate>=?)",
          )
          .all(String(room.id), exclude, to, from) as unknown as OccupancyStay[]
      )
        .map((stay) => ({
          ...stay,
          endDate:
            stay.status === "Completed" &&
            stay.patientStatus === "Discharged" &&
            stay.endDate === stay.patientDischargeDate
              ? dateAdd(stay.endDate, -1)
              : stay.endDate,
        }))
        .filter((stay) => stay.status === "Active" || stay.endDate >= from);
      const boundaries = new Set([from]);
      for (const stay of stays) {
        if (String(stay.startDate) >= from)
          boundaries.add(String(stay.startDate));
        if (
          stay.status !== "Active" &&
          String(stay.endDate) >= from &&
          String(stay.endDate) < to
        )
          boundaries.add(dateAdd(String(stay.endDate), 1));
      }
      let occupied = 0;
      for (const date of boundaries) {
        const patients = new Set(
          stays
            .filter(
              (stay) =>
                String(stay.startDate) <= date &&
                (stay.status === "Active" || String(stay.endDate) >= date),
            )
            .map((stay) => String(stay.patientId)),
        );
        occupied = Math.max(occupied, patients.size);
      }
      return {
        ...room,
        active: !!room.active,
        occupied,
        available: Math.max(0, Number(room.capacity) - occupied),
      };
    }) as unknown as Room[];
}
workflowRouter.get("/rooms", (req, res) => {
  const patient = req.query.patientId
    ? patientRow(z.string().parse(req.query.patientId))
    : null;
  const from = s.dateSchema.parse(
      req.query.from ?? patient?.admissionDate ?? today(),
    ),
    to = s.dateSchema.parse(req.query.to ?? patient?.dischargeDate ?? from);
  if (to < from)
    fail(400, "Availability end date must be on or after its start date");
  res.json(getRooms(from, to, patient?.id));
});
workflowRouter.post("/rooms", (req, res) => {
  const data = s.roomSchema.parse(req.body);
  if (
    db.prepare("SELECT id FROM rooms WHERE lower(name)=lower(?)").get(data.name)
  )
    fail(409, "A room with this name already exists");
  const room = { id: uid(), ...data, active: Number(data.active) };
  transact(() => {
    insert("rooms", room);
    audit(null, "Room added", data.name, req.user.name);
  });
  res.status(201).json(room);
});
workflowRouter.put("/rooms/:id", (req, res) => {
  const data = s.roomSchema.parse(req.body);
  const count =
    getRooms(today(), "9999-12-31").find((room) => room.id === param(req))
      ?.occupied ?? 0;
  if (data.capacity < count || (!data.active && count))
    fail(
      409,
      "This room has active occupants. Transfer or discharge them first.",
    );
  if (
    db
      .prepare("SELECT id FROM rooms WHERE lower(name)=lower(?) AND id<>?")
      .get(data.name, param(req))
  )
    fail(409, "A room with this name already exists");
  transact(() => {
    if (
      !db
        .prepare(
          "UPDATE rooms SET name=?,type=?,capacity=?,rate=?,active=? WHERE id=?",
        )
        .run(
          data.name,
          data.type,
          data.capacity,
          data.rate,
          Number(data.active),
          param(req),
        ).changes
    )
      fail(404, "Room not found");
    audit(null, "Room updated", data.name, req.user.name);
  });
  res.json({ ok: true });
});
workflowRouter.post("/patients/:id/room", (req, res) => {
  const data = s.roomAssignmentSchema.parse(req.body);
  const p = activePatient(param(req));
  checkDates(p, [data.startDate]);
  transact(() => {
    const room = getRooms(data.startDate, p.dischargeDate, p.id).find(
      (r) => r.id === data.roomId,
    );
    if (!room || !room.active) fail(400, "Select an active room");
    if (room!.available < 1) fail(409, "This room has no available beds");
    const existing = db
      .prepare("SELECT * FROM room_stays WHERE patientId=? AND status='Active'")
      .get(p.id);
    if (existing?.roomId === data.roomId)
      fail(409, "The patient is already assigned to this room");
    if (existing && String(existing.startDate) > data.startDate)
      fail(400, "Transfer date cannot precede the current stay");
    if (existing && data.startDate > today())
      fail(400, "Record a room transfer on the date it happens.");
    if (
      existing &&
      db
        .prepare("SELECT id FROM bill_items WHERE source=?")
        .get("room:" + existing.recordId)
    )
      fail(
        409,
        "Current accommodation is already invoiced. Keep it reconciled before transferring.",
      );
    if (existing) {
      const end = dateAdd(data.startDate, -1),
        cancelled = data.startDate === existing.startDate;
      db.prepare("UPDATE room_stays SET status=?,endDate=? WHERE id=?").run(
        cancelled ? "Cancelled" : "Completed",
        cancelled ? String(existing.startDate) : end,
        String(existing.id),
      );
      db.prepare("UPDATE records SET status=?,quantity=? WHERE id=?").run(
        cancelled ? "Cancelled" : "Completed",
        cancelled ? 1 : daysBetween(String(existing.startDate), end),
        String(existing.recordId),
      );
    }
    const recordId = uid();
    insert("records", {
      id: recordId,
      patientId: p.id,
      kind: "accommodation",
      title: `${room!.name} · ${room!.type}`,
      detail: "Room assignment",
      date: data.startDate,
      status: "Occupied",
      quantity: daysBetween(data.startDate, p.dischargeDate),
      amount: room!.rate,
      session: "",
      createdAt: now(),
    });
    insert("room_stays", {
      id: uid(),
      patientId: p.id,
      roomId: data.roomId,
      startDate: data.startDate,
      endDate: p.dischargeDate,
      rate: room!.rate,
      status: "Active",
      recordId,
    });
    db.prepare("UPDATE patients SET room=? WHERE id=?").run(
      `${room!.name} · ${room!.type}`,
      p.id,
    );
    audit(
      p.id,
      existing ? "Room transferred" : "Room assigned",
      `${room!.name} · from ${data.startDate}`,
      req.user.name,
    );
  });
  res.status(201).json({ ok: true });
});
workflowRouter.get("/physicians", (_req, res) =>
  res.json(
    db
      .prepare("SELECT * FROM physicians ORDER BY name")
      .all()
      .map((p) => ({ ...p, active: !!p.active })),
  ),
);
workflowRouter.post("/physicians", (req, res) => {
  const data = s.physicianSchema.parse(req.body);
  if (
    db
      .prepare("SELECT id FROM physicians WHERE lower(name)=lower(?)")
      .get(data.name)
  )
    fail(409, "This physician already exists");
  const physician = { id: uid(), ...data, active: Number(data.active) };
  transact(() => {
    insert("physicians", physician);
    audit(null, "Physician added", data.name, req.user.name);
  });
  res.status(201).json(physician);
});
workflowRouter.put("/physicians/:id", (req, res) => {
  const data = s.physicianSchema.parse(req.body);
  if (
    db
      .prepare("SELECT id FROM physicians WHERE lower(name)=lower(?) AND id<>?")
      .get(data.name, param(req))
  )
    fail(409, "This physician already exists");
  transact(() => {
    if (
      !db
        .prepare(
          "UPDATE physicians SET name=?,speciality=?,phone=?,email=?,active=? WHERE id=?",
        )
        .run(
          data.name,
          data.speciality,
          data.phone,
          data.email,
          Number(data.active),
          param(req),
        ).changes
    )
      fail(404, "Physician not found");
    audit(null, "Physician updated", data.name, req.user.name);
  });
  res.json({ ok: true });
});
workflowRouter.post("/patients/:id/discharge", (req, res) => {
  const data = s.dischargeSchema.parse(req.body);
  const p = activePatient(param(req));
  if (
    data.date < p.admissionDate ||
    daysBetween(p.admissionDate, data.date) > 366
  )
    fail(400, "Choose a discharge date within 366 days of admission");
  if (data.date > today()) fail(400, "Discharge date cannot be in the future");
  if (data.nextVisit && data.nextVisit < data.date)
    fail(400, "Follow-up must be on or after discharge");
  transact(() => {
    if (
      db
        .prepare(
          "SELECT id FROM assignments WHERE patientId=? AND status='Completed' AND date>? UNION SELECT id FROM vitals WHERE patientId=? AND date>? LIMIT 1",
        )
        .get(p.id, data.date, p.id, data.date)
    )
      fail(
        409,
        "Discharge cannot precede completed therapies or recorded vitals",
      );
    const stay = db
      .prepare("SELECT * FROM room_stays WHERE patientId=? AND status='Active'")
      .get(p.id);
    if (stay && String(stay.startDate) > data.date)
      fail(409, "Discharge cannot precede the active room stay");
    if (
      stay &&
      db
        .prepare("SELECT id FROM bill_items WHERE source=?")
        .get("room:" + stay.recordId) &&
      data.date !== p.dischargeDate
    )
      fail(409, "Accommodation is already invoiced for a different end date");
    db.prepare(
      "UPDATE patients SET status='Discharged',dischargeDate=?,dischargedAt=?,nextVisit=? WHERE id=?",
    ).run(data.date, now(), data.nextVisit, p.id);
    db.prepare(
      "UPDATE assignments SET status='Cancelled' WHERE patientId=? AND status='Scheduled' AND date>?",
    ).run(p.id, data.date);
    db.prepare(
      "UPDATE records SET status='Cancelled' WHERE patientId=? AND kind='program' AND status='Scheduled' AND date>?",
    ).run(p.id, data.date);
    if (stay) {
      db.prepare(
        "UPDATE room_stays SET status='Completed',endDate=? WHERE id=?",
      ).run(data.date, String(stay.id));
      db.prepare(
        "UPDATE records SET status='Completed',quantity=? WHERE id=?",
      ).run(
        daysBetween(String(stay.startDate), data.date),
        String(stay.recordId),
      );
    }
    insert("records", {
      id: uid(),
      patientId: p.id,
      kind: "discharge",
      title: "Final discharge summary",
      detail: `${data.summary}\n\nFollow-up instructions\n${data.instructions}`,
      date: data.date,
      status: "Final",
      quantity: 1,
      amount: 0,
      session: "",
      createdAt: now(),
    });
    audit(
      p.id,
      "Patient discharged",
      `${data.date} · ${data.nextVisit ? "follow-up " + data.nextVisit : "no follow-up set"}`,
      req.user.name,
    );
  });
  res.json(getWorkspace(p.id));
});
workflowRouter.patch("/patients/:id/records/:entryId/status", (req, res) => {
  const { status } = z
    .strictObject({
      status: z.enum([
        "Active",
        "Pending",
        "Scheduled",
        "Completed",
        "Cancelled",
      ]),
    })
    .parse(req.body);
  const record = db
    .prepare("SELECT * FROM records WHERE id=? AND patientId=?")
    .get(param(req, "entryId"), param(req));
  if (!record) fail(404, "Care record not found");
  if (!["program", "investigation", "diet"].includes(String(record!.kind)))
    fail(400, "This record uses a dedicated workflow");
  transact(() => {
    db.prepare("UPDATE records SET status=? WHERE id=?").run(
      status,
      param(req, "entryId"),
    );
    audit(
      param(req),
      "Care status updated",
      `${record!.title} · ${status}`,
      req.user.name,
    );
  });
  res.json({ ok: true });
});
workflowRouter.delete("/patients/:id/records/:entryId", (req, res, next) => {
  const record = db
    .prepare("SELECT * FROM records WHERE id=? AND patientId=?")
    .get(param(req, "entryId"), param(req));
  if (!record) return next();
  const meta = JSON.parse(String(record.metadata));
  if (record.kind === "prescription" && Number(meta.dispensedQuantity) > 0)
    fail(409, "Dispensed prescriptions stay in the care record");
  if (
    record.kind === "accommodation" &&
    db
      .prepare("SELECT id FROM room_stays WHERE recordId=?")
      .get(String(record.id))
  )
    fail(
      409,
      "Use room assignment or discharge to update an accommodation stay",
    );
  if (record.kind === "discharge" && record.status === "Final")
    fail(409, "Final discharge summaries remain in the patient record");
  if (record.kind === "estimate") {
    const line = db
      .prepare(
        "SELECT b.scheduledAt,b.invoiceId FROM estimate_lines l JOIN estimate_batches b ON b.id=l.batchId WHERE recordId=?",
      )
      .get(String(record.id));
    if (line && (line.scheduledAt || line.invoiceId))
      fail(409, "Scheduled or invoiced estimates remain in the care record");
  }
  next();
});
