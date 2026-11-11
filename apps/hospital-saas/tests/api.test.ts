import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { DatabaseSync } from "node:sqlite";
const directory = mkdtempSync(join(tmpdir(), "vaidya-api-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_PATH: join(directory, "test.sqlite"),
  UPLOAD_DIR: join(directory, "uploads"),
  ADMIN_EMAIL: "test@vaidya.local",
  ADMIN_PASSWORD: "test-only-password-982734",
  SEED_DEMO: "true",
  COOKIE_SECURE: "false",
  APP_ORIGIN: "http://localhost:5173",
});
let server: Server,
  base = "",
  cookie = "",
  csrf = "";
let db: DatabaseSync;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  options: { cookie?: string; csrf?: string; origin?: string } = {},
) {
  return fetch(base + path, {
    method,
    headers: {
      cookie: options.cookie ?? cookie,
      ...(body ? { "content-type": "application/json" } : {}),
      "x-csrf-token": options.csrf ?? csrf,
      ...(options.origin ? { origin: options.origin } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
before(async () => {
  const mod = await import("../server/app.ts");
  db = (await import("../server/db.ts")).db;
  server = mod.app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
});
after(async () => {
  await new Promise<void>((r, e) =>
    server.close((err) => (err ? e(err) : r())),
  );
  db.close();
  rmSync(directory, { recursive: true, force: true });
});
test("private endpoints reject unauthenticated access; health remains public", async () => {
  assert.equal((await request("/patients")).status, 401);
  assert.equal((await request("/health")).status, 200);
});
test("sign-in rejects bad credentials and creates an httpOnly session", async () => {
  assert.equal(
    (
      await request("/auth/login", "POST", {
        email: "test@vaidya.local",
        password: "incorrect",
      })
    ).status,
    401,
  );
  const r = await request("/auth/login", "POST", {
    email: "test@vaidya.local",
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(r.status, 200);
  const set = r.headers.get("set-cookie")!;
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Strict/);
  cookie = set.split(";")[0];
  csrf = (await r.json()).csrf;
  assert.ok(csrf);
});
test("reference workspace and JSON API schemas load", async () => {
  const r = await request("/patients/25559/workspace");
  const data = await r.json();
  assert.equal(data.patient.name, "Kailash Kanwar");
  assert.ok(data.assignments.length > 30);
  assert.equal(data.vitals[0].temperature, 37);
  const s = await request("/schemas");
  assert.equal(s.status, 200);
  assert.ok((await s.json()).vitalSchema);
});
test("mutations require CSRF tokens and reject other origins", async () => {
  assert.equal(
    (await request("/patients/25559/notes", "POST", {}, { csrf: "invalid" }))
      .status,
    403,
  );
  assert.equal(
    (
      await request(
        "/patients/25559/notes",
        "POST",
        {},
        { origin: "https://untrusted.invalid" },
      )
    ).status,
    403,
  );
});
const vital = {
  date: "2026-09-02",
  session: "Morning",
  time: "09:15",
  temperature: 36.8,
  weight: 79.5,
  bp: "118/78",
  pulse: 77,
  rr: 18,
  painScore: 5,
  spo2: 98,
};
test("vitals reject invalid units, unknown keys, impossible dates, out-of-stay dates and empty input", async () => {
  for (const body of [
    { ...vital, temperature: 98.6 },
    { ...vital, unexpected: "field" },
    { ...vital, date: "2026-02-30" },
    { ...vital, date: "2027-01-01" },
    { date: "2026-09-02", session: "Morning", time: "09:00" },
  ]) {
    const r = await request("/patients/25559/vitals", "POST", body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});
test("session observations upsert independently and persist in SQLite", async () => {
  for (const body of [
    vital,
    { ...vital, session: "Noon", pulse: 84 },
    { ...vital, pulse: 79 },
  ])
    assert.equal(
      (await request("/patients/25559/vitals", "POST", body)).status,
      201,
    );
  const ws = await (await request("/patients/25559/workspace")).json();
  const rows = ws.vitals.filter((v: { date: string }) => v.date === vital.date);
  assert.equal(rows.length, 2);
  assert.equal(
    rows.find((v: { session: string }) => v.session === "Morning").pulse,
    79,
  );
  const disk = new DatabaseSync(join(directory, "test.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    disk
      .prepare("SELECT COUNT(*) AS n FROM vitals WHERE date='2026-09-02'")
      .get()?.n,
    2,
  );
  disk.close();
});
test("legacy upserts one daily record and preserves original session records on switching back", async () => {
  const p = (await (await request("/patients/25559/workspace")).json()).patient;
  delete p.id;
  delete p.createdAt;
  delete p.status;
  delete p.dischargedAt;
  assert.equal(
    (await request("/patients/25559", "PUT", { ...p, vitalsMode: "legacy" }))
      .status,
    200,
  );
  await request("/patients/25559/vitals", "POST", { ...vital, pulse: 90 });
  await request("/patients/25559/vitals", "POST", {
    ...vital,
    session: "Evening",
    pulse: 92,
  });
  const rows = (
    await (await request("/patients/25559/workspace")).json()
  ).vitals.filter((v: { date: string }) => v.date === vital.date);
  assert.equal(rows.length, 3);
  assert.equal(
    rows.filter((v: { session: string }) => v.session === "Daily").length,
    1,
  );
  assert.equal(
    rows.find((v: { session: string }) => v.session === "Daily").pulse,
    92,
  );
  assert.equal((await request("/patients/25559", "PUT", p)).status, 200);
});
test("therapy scheduling works across multiple dates and sessions without duplicates", async () => {
  const body = {
    dates: ["2026-09-11", "2026-09-12"],
    sessions: ["Morning", "Evening"],
    therapyIds: ["t2", "t9"],
  };
  let r = await request("/patients/25559/assignments", "POST", body);
  assert.equal(r.status, 201);
  assert.equal((await r.json()).created, 8);
  r = await request("/patients/25559/assignments", "POST", body);
  assert.equal((await r.json()).created, 0);
  assert.equal(
    (
      await request("/patients/25559/assignments", "POST", {
        ...body,
        therapyIds: ["unknown"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/patients/25559/assignments", "POST", {
        ...body,
        dates: ["2026-10-20"],
      })
    ).status,
    400,
  );
});
test("therapy completion, notes and deletion are scoped to the patient", async () => {
  const ws = await (await request("/patients/25559/workspace")).json();
  const entry = ws.assignments.find(
    (a: { date: string }) => a.date === "2026-09-11",
  );
  assert.equal(
    (
      await request(`/patients/25559/assignments/${entry.id}`, "PATCH", {
        status: "Completed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/patients/25559/notes", "POST", {
        date: "2026-09-11",
        session: "Evening",
        text: "Procedure completed and reviewed.",
      })
    ).status,
    201,
  );
  assert.equal(
    (await request(`/patients/other/assignments/${entry.id}`, "DELETE")).status,
    404,
  );
});
test("all care record kinds support create, update, delete and reject extra inputs", async () => {
  for (const kind of [
    "history",
    "prescription",
    "diet",
    "investigation",
    "discharge",
    "program",
    "accommodation",
  ]) {
    const body = {
      kind,
      title: `Test ${kind}`,
      detail: "API integration test",
      date: "2026-09-09",
      status: "Active",
      quantity: 1,
      amount: 0,
      session: "",
    };
    const r = await request("/patients/25559/records", "POST", body);
    assert.equal(r.status, 201);
    const { id } = await r.json();
    assert.equal(
      (
        await request(`/patients/25559/records/${id}`, "PUT", {
          ...body,
          title: "Updated record",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/patients/25559/records/${id}`, "DELETE")).status,
      200,
    );
  }
  assert.equal(
    (await request("/patients/25559/records", "POST", { kind: "invalid" }))
      .status,
    400,
  );
});
test("estimates use catalog prices and roll back the whole transaction if a therapy is invalid", async () => {
  const before = Number(
    db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='estimate'").get()
      ?.n,
  );
  const bad = await request("/patients/25559/estimates", "POST", {
    session: "All",
    items: [
      { therapyId: "t1", days: 3 },
      { therapyId: "invalid", days: 1 },
    ],
  });
  assert.equal(bad.status, 400);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind='estimate'").get()
      ?.n,
    before,
  );
  const r = await request("/patients/25559/estimates", "POST", {
    session: "All",
    items: [{ therapyId: "t1", days: 3 }],
  });
  assert.equal(r.status, 201);
  assert.equal((await r.json()).total, 750 * 3 * 3);
});
test("inventory rejects negative stock; bills can be marked paid", async () => {
  assert.equal(
    (
      await request("/inventory", "POST", {
        name: "Test medicine",
        stock: -1,
        unit: "units",
        price: 20,
      })
    ).status,
    400,
  );
  const created = await (
    await request("/inventory", "POST", {
      name: "Test medicine",
      stock: 10,
      unit: "units",
      price: 20,
    })
  ).json();
  assert.equal(
    (
      await request(`/inventory/${created.id}`, "PUT", {
        name: "Test medicine",
        stock: 20,
        unit: "units",
        price: 25,
      })
    ).status,
    200,
  );
  const bill = await (
    await request("/patients/25559/bills", "POST", {
      title: "Test care bill",
      amount: 500,
      status: "Unpaid",
    })
  ).json();
  assert.equal(
    (
      await request(`/patients/25559/bills/${bill.id}`, "PATCH", {
        status: "Paid",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/patients/25559/bills", "POST", {
        title: "Negative bill",
        amount: -5,
      })
    ).status,
    400,
  );
});
test("uploads validate file signatures and enforce private download/deletion", async () => {
  const invalid = new FormData();
  invalid.append(
    "file",
    new Blob(["not a pdf"], { type: "application/pdf" }),
    "fake.pdf",
  );
  assert.equal(
    (
      await fetch(base + "/patients/25559/documents", {
        method: "POST",
        headers: { cookie, "x-csrf-token": csrf },
        body: invalid,
      })
    ).status,
    400,
  );
  const content = "%PDF-1.4\nTest report\n%%EOF";
  const form = new FormData();
  form.append(
    "file",
    new Blob([content], { type: "application/pdf" }),
    "report.pdf",
  );
  const r = await fetch(base + "/patients/25559/documents", {
    method: "POST",
    headers: { cookie, "x-csrf-token": csrf },
    body: form,
  });
  assert.equal(r.status, 201);
  const doc = await r.json();
  const download = await request(`/patients/25559/documents/${doc.id}`);
  assert.equal(await download.text(), content);
  assert.equal(
    (
      await request(`/patients/25559/documents/${doc.id}`, "GET", undefined, {
        cookie: "",
      })
    ).status,
    401,
  );
  assert.equal(
    (await request(`/patients/25559/documents/${doc.id}`, "DELETE")).status,
    200,
  );
});
test("patients can be admitted; unsafe stay date changes are rejected; activity is recorded", async () => {
  const { patient: p } = await (
    await request("/patients/25559/workspace")
  ).json();
  delete p.id;
  delete p.createdAt;
  delete p.status;
  delete p.dischargedAt;
  assert.equal(
    (
      await request("/patients/25559", "PUT", {
        ...p,
        dischargeDate: "2026-09-02",
      })
    ).status,
    409,
  );
  const r = await request("/patients", "POST", {
    ...p,
    name: "Integration Test Patient",
    room: "Unassigned",
    admissionDate: "2026-10-01",
    dischargeDate: "2026-10-03",
  });
  assert.equal(r.status, 201);
  assert.ok((await r.json()).id);
  const ws = await (await request("/patients/25559/workspace")).json();
  assert.ok(ws.audit.length > 5);
});
test("sign-out invalidates the server session", async () => {
  assert.equal((await request("/auth/logout", "POST")).status, 200);
  assert.equal((await request("/auth/me")).status, 401);
});
