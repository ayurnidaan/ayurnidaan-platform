import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { Server } from "node:http";
import { upgradeDatabase } from "../server/migrations.ts";
const folder = mkdtempSync(join(tmpdir(), "vaidya-workflows-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_PATH: join(folder, "db.sqlite"),
  UPLOAD_DIR: join(folder, "uploads"),
  ADMIN_EMAIL: "workflows@vaidya.local",
  ADMIN_PASSWORD: "isolated-workflow-password",
  SEED_DEMO: "true",
  COOKIE_SECURE: "false",
  APP_ORIGIN: "http://localhost:5173",
});
let server: Server,
  db: DatabaseSync,
  base = "",
  cookie = "",
  csrf = "";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  status = 200,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      cookie,
      "x-csrf-token": csrf,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
async function patient(name: string) {
  return call(
    "/patients",
    "POST",
    {
      name,
      age: 40,
      gender: "Female",
      admissionDate: "2026-09-01",
      dischargeDate: "2026-09-19",
      physician: "Dr. Test",
    },
    201,
  );
}
before(async () => {
  const { app } = await import("../server/app.ts");
  db = (await import("../server/db.ts")).db;
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const response = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  cookie = response.headers.get("set-cookie")!.split(";")[0];
  csrf = (await response.json()).csrf;
});
after(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  db?.close();
  assert.ok(
    resolve(folder).startsWith(resolve(tmpdir()) + sep) &&
      basename(folder).startsWith("vaidya-workflows-"),
  );
  rmSync(folder, { recursive: true, force: true });
});

test("migration preserves legacy invoices, paid receipts, prescriptions and occupied rooms", () => {
  const old = new DatabaseSync(":memory:");
  old.exec(
    `CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE patients(id TEXT PRIMARY KEY,name TEXT,physician TEXT,room TEXT,admissionDate TEXT,dischargeDate TEXT);CREATE TABLE therapies(id TEXT PRIMARY KEY,name TEXT,price REAL);CREATE TABLE assignments(id TEXT PRIMARY KEY,therapyId TEXT);CREATE TABLE records(id TEXT PRIMARY KEY,patientId TEXT,kind TEXT,title TEXT,detail TEXT,date TEXT,status TEXT,quantity REAL,amount REAL,session TEXT,createdAt TEXT);CREATE TABLE inventory(id TEXT PRIMARY KEY,name TEXT);CREATE TABLE bills(id TEXT PRIMARY KEY,patientId TEXT,title TEXT,amount REAL,status TEXT,createdAt TEXT);INSERT INTO users VALUES('u','Dr. Legacy');INSERT INTO patients VALUES('p','Existing patient','Dr. Legacy','A-204 · Private','2026-09-01','2026-09-19');INSERT INTO records VALUES('r','p','accommodation','A-204','Original stay','2026-09-01','Occupied',19,2000,'','2026-09-01T09:00:00Z');INSERT INTO bills VALUES('b','p','Existing paid bill',125.50,'Paid','2026-09-02T09:00:00Z');PRAGMA user_version=1;`,
  );
  upgradeDatabase(old);
  assert.equal(
    old.prepare("SELECT paidCents FROM bills WHERE id=?").get("b")!.paidCents,
    12550,
  );
  assert.equal(
    old.prepare("SELECT SUM(amountCents) AS n FROM payments").get()!.n,
    12550,
  );
  assert.equal(old.prepare("SELECT COUNT(*) AS n FROM room_stays").get()!.n, 1);
  assert.equal(
    old.prepare("SELECT quantity FROM records WHERE id=?").get("r")!.quantity,
    19,
  );
  upgradeDatabase(old);
  assert.equal(old.prepare("SELECT COUNT(*) AS n FROM payments").get()!.n, 1);
  old.close();
});
test("directory supports paging, literal search, lifecycle filters and patient exports", async () => {
  await patient("Searchable New Patient");
  const result = await call(
    "/patients/directory?search=Searchable&status=Admitted&pageSize=1",
  );
  assert.equal(result.total, 1);
  assert.equal(result.items[0].name, "Searchable New Patient");
  assert.equal((await call("/patients/directory?search=%25")).total, 0);
  const exported = await call("/patients/25559/export");
  assert.equal(exported.patient.id, "25559");
  assert.ok(Array.isArray(exported.roomStays));
});
test("tariff edits preserve booked prices; archived therapies cannot be newly booked", async () => {
  const t = await call(
    "/therapies",
    "POST",
    {
      name: "Test tariff therapy",
      category: "CGHS",
      price: 123.45,
      duration: 30,
    },
    201,
  );
  const p = await patient("Price Snapshot Patient");
  await call(
    `/patients/${p.id}/assignments`,
    "POST",
    { dates: ["2026-09-02"], sessions: ["Morning"], therapyIds: [t.id] },
    201,
  );
  await call("/therapies/" + t.id, "PUT", {
    name: t.name,
    category: t.category,
    price: 555,
    duration: 45,
    active: false,
  });
  const ws = await call(`/patients/${p.id}/workspace`);
  assert.equal(ws.assignments[0].price, 123.45);
  await call(
    `/patients/${p.id}/assignments`,
    "POST",
    { dates: ["2026-09-03"], sessions: ["Morning"], therapyIds: [t.id] },
    400,
  );
  assert.ok(
    !(await call("/therapies")).some((v: { id: string }) => v.id === t.id),
  );
});
test("estimate booking validates the entire date range, prevents duplicate booking and invoices once", async () => {
  const p = await patient("Estimate Workflow Patient");
  const quote = await call(
    `/patients/${p.id}/estimates`,
    "POST",
    { session: "All", items: [{ therapyId: "t9", days: 3 }] },
    201,
  );
  await call(
    `/patients/${p.id}/estimates/${quote.batch}/schedule`,
    "POST",
    { startDate: "2026-09-18" },
    400,
  );
  assert.equal(
    (await call(`/patients/${p.id}/workspace`)).assignments.length,
    0,
  );
  await call(
    `/patients/${p.id}/estimates/${quote.batch}/schedule`,
    "POST",
    { startDate: "2026-09-02" },
    201,
  );
  await call(
    `/patients/${p.id}/estimates/${quote.batch}/schedule`,
    "POST",
    { startDate: "2026-09-02" },
    409,
  );
  let ws = await call(`/patients/${p.id}/workspace`);
  assert.equal(ws.assignments.length, 9);
  const first = await call(
    `/patients/${p.id}/estimates/${quote.batch}/invoice`,
    "POST",
    undefined,
    201,
  );
  const again = await call(
    `/patients/${p.id}/estimates/${quote.batch}/invoice`,
    "POST",
    undefined,
    201,
  );
  assert.equal(first.id, again.id);
  assert.equal(first.amount, 4050);
  ws = await call(`/patients/${p.id}/workspace`);
  await call(`/patients/${p.id}/assignments/${ws.assignments[0].id}`, "PATCH", {
    status: "Completed",
  });
  await call(
    `/patients/${p.id}/invoices/from-care`,
    "POST",
    { requestId: randomUUID() },
    409,
  );
});
test("dispensing is atomic, stock-limited and idempotent; issued prescriptions cannot be deleted", async () => {
  const item = await call(
    "/inventory",
    "POST",
    {
      name: "Dispense test medicine",
      stock: 5,
      unit: "tablets",
      price: 12.35,
      reorderLevel: 2,
    },
    201,
  );
  const p = await patient("Medicine Workflow Patient");
  const record = await call(
    `/patients/${p.id}/prescriptions`,
    "POST",
    {
      inventoryId: item.id,
      name: item.name,
      dose: "Clinician-entered dose",
      frequency: "As directed",
      days: 3,
      quantity: 6,
      instructions: "Recorded instructions",
      date: "2026-09-01",
    },
    201,
  );
  await call(
    `/patients/${p.id}/prescriptions/${record.id}/dispense`,
    "POST",
    { quantity: 6, requestId: randomUUID() },
    409,
  );
  assert.equal(
    (await call("/inventory")).find((i: { id: string }) => i.id === item.id)
      .stock,
    5,
  );
  assert.equal((await call(`/patients/${p.id}/workspace`)).bills.length, 0);
  const requestId = randomUUID();
  const invoice = await call(
    `/patients/${p.id}/prescriptions/${record.id}/dispense`,
    "POST",
    { quantity: 3, requestId },
    201,
  );
  assert.equal(invoice.amount, 37.05);
  await call(
    `/patients/${p.id}/prescriptions/${record.id}/dispense`,
    "POST",
    { quantity: 3, requestId },
    201,
  );
  assert.equal(
    (await call("/inventory")).find((i: { id: string }) => i.id === item.id)
      .stock,
    2,
  );
  const ws = await call(`/patients/${p.id}/workspace`);
  assert.equal(ws.bills.length, 1);
  assert.equal(ws.records[0].prescription.dispensedQuantity, 3);
  assert.equal((await call(`/inventory/${item.id}/movements`)).length, 1);
  await call(
    `/patients/${p.id}/records/${record.id}`,
    "DELETE",
    undefined,
    409,
  );
});
test("stock adjustments validate lower bounds and replay without double-counting", async () => {
  const item = await call(
    "/inventory",
    "POST",
    { name: "Adjustment test", stock: 2, unit: "units", price: 10 },
    201,
  );
  const requestId = randomUUID();
  await call(`/inventory/${item.id}/adjustments`, "POST", {
    delta: 5,
    reason: "Supplier delivery",
    requestId,
  });
  await call(`/inventory/${item.id}/adjustments`, "POST", {
    delta: 5,
    reason: "Supplier delivery",
    requestId,
  });
  await call(
    `/inventory/${item.id}/adjustments`,
    "POST",
    { delta: -8, reason: "Stock correction", requestId: randomUUID() },
    409,
  );
  assert.equal(
    (await call("/inventory")).find((i: { id: string }) => i.id === item.id)
      .stock,
    7,
  );
});
test("itemized invoices use cent precision and partial payments reject overpayment or replay duplication", async () => {
  const p = await patient("Invoice Workflow Patient"),
    requestId = randomUUID();
  const data = {
    title: "Itemized care invoice",
    items: [
      { description: "Service one", quantity: 3, unitPrice: 12.35 },
      { description: "Service two", quantity: 1, unitPrice: 0.1 },
    ],
    requestId,
  };
  const invoice = await call(`/patients/${p.id}/invoices`, "POST", data, 201);
  assert.equal(invoice.amount, 37.15);
  assert.equal(
    (await call(`/patients/${p.id}/invoices`, "POST", data, 201)).id,
    invoice.id,
  );
  const payment = {
    amount: 10,
    method: "UPI",
    reference: "receipt-1",
    date: "2026-09-19",
    requestId: randomUUID(),
  };
  await call(
    `/patients/${p.id}/invoices/${invoice.id}/payments`,
    "POST",
    payment,
    201,
  );
  await call(
    `/patients/${p.id}/invoices/${invoice.id}/payments`,
    "POST",
    payment,
    201,
  );
  let bill = (await call(`/patients/${p.id}/workspace`)).bills[0];
  assert.equal(bill.status, "Partially paid");
  assert.equal(bill.balance, 27.15);
  assert.equal(bill.payments.length, 1);
  await call(
    `/patients/${p.id}/invoices/${invoice.id}/payments`,
    "POST",
    { ...payment, amount: 30, requestId: randomUUID() },
    409,
  );
  await call(
    `/patients/${p.id}/invoices/${invoice.id}/payments`,
    "POST",
    { ...payment, amount: 27.15, requestId: randomUUID() },
    201,
  );
  bill = (await call(`/patients/${p.id}/workspace`)).bills[0];
  assert.equal(bill.status, "Paid");
  assert.equal(bill.balance, 0);
  await call(
    `/patients/${p.id}/bills/${invoice.id}`,
    "PATCH",
    { status: "Unpaid" },
    409,
  );
});
test("completed care is billed once; billed assignments cannot be deleted or reopened", async () => {
  const p = await patient("Completed Care Patient");
  await call(
    `/patients/${p.id}/assignments`,
    "POST",
    { dates: ["2026-09-01"], sessions: ["Morning"], therapyIds: ["t9"] },
    201,
  );
  const a = (await call(`/patients/${p.id}/workspace`)).assignments[0];
  await call(`/patients/${p.id}/assignments/${a.id}`, "PATCH", {
    status: "Completed",
  });
  const bill = await call(
    `/patients/${p.id}/invoices/from-care`,
    "POST",
    { requestId: randomUUID() },
    201,
  );
  assert.equal(bill.amount, 450);
  await call(
    `/patients/${p.id}/invoices/from-care`,
    "POST",
    { requestId: randomUUID() },
    409,
  );
  await call(`/patients/${p.id}/assignments/${a.id}`, "DELETE", undefined, 409);
  await call(
    `/patients/${p.id}/assignments/${a.id}`,
    "PATCH",
    { status: "Scheduled" },
    409,
  );
});
test("room assignment enforces capacity and transfer closes the earlier stay", async () => {
  const room = await call(
    "/rooms",
    "POST",
    { name: "Test Single Room", type: "Private", capacity: 1, rate: 500 },
    201,
  );
  const one = await patient("Room Patient One"),
    two = await patient("Room Patient Two");
  await call(
    `/patients/${one.id}/room`,
    "POST",
    { roomId: room.id, startDate: "2026-09-01" },
    201,
  );
  await call(
    `/patients/${two.id}/room`,
    "POST",
    { roomId: room.id, startDate: "2026-09-01" },
    409,
  );
  const next = await call(
    "/rooms",
    "POST",
    { name: "Test Transfer Room", type: "Private", capacity: 1, rate: 600 },
    201,
  );
  await call(
    `/patients/${one.id}/room`,
    "POST",
    { roomId: next.id, startDate: "2026-09-05" },
    201,
  );
  const ws = await call(`/patients/${one.id}/workspace`);
  assert.equal(
    ws.roomStays.filter((r: { status: string }) => r.status === "Active")
      .length,
    1,
  );
  assert.equal(
    ws.roomStays.find((r: { roomId: string }) => r.roomId === room.id).endDate,
    "2026-09-04",
  );
  assert.match(ws.patient.room, /Test Transfer Room/);
  await call(
    `/patients/${two.id}/room`,
    "POST",
    { roomId: room.id, startDate: "2026-09-03" },
    409,
  );
  await call(
    `/patients/${two.id}/room`,
    "POST",
    { roomId: room.id, startDate: "2026-09-05" },
    201,
  );
});
test("discharge persists final handover, releases a bed and cancels future scheduled care", async () => {
  const p = await patient("Discharge Workflow Patient");
  const room = await call(
    "/rooms",
    "POST",
    { name: "Discharge Test Room", type: "Private", capacity: 1, rate: 500 },
    201,
  );
  await call(
    `/patients/${p.id}/room`,
    "POST",
    { roomId: room.id, startDate: "2026-09-01" },
    201,
  );
  await call(
    `/patients/${p.id}/assignments`,
    "POST",
    {
      dates: ["2026-09-04", "2026-09-15"],
      sessions: ["Morning"],
      therapyIds: ["t9"],
    },
    201,
  );
  const ws = await call(`/patients/${p.id}/discharge`, "POST", {
    date: "2026-09-10",
    summary: "Final clinical handover recorded by the attending physician.",
    instructions: "Attend the recorded follow-up.",
    nextVisit: "2026-09-17",
  });
  assert.equal(ws.patient.status, "Discharged");
  assert.equal(ws.roomStays[0].status, "Completed");
  assert.equal(
    ws.assignments.find((a: { date: string }) => a.date === "2026-09-15")
      .status,
    "Cancelled",
  );
  assert.ok(
    ws.records.some(
      (r: { kind: string; status: string }) =>
        r.kind === "discharge" && r.status === "Final",
    ),
  );
  await call(
    `/patients/${p.id}/assignments`,
    "POST",
    { dates: ["2026-09-09"], sessions: ["Morning"], therapyIds: ["t9"] },
    409,
  );
  const updated = (await call("/rooms")).find(
    (r: { id: string }) => r.id === room.id,
  );
  assert.equal(updated.available, 1);
});
test("planned stay edits reconcile room days; finalized dates and unreserved room text are rejected", async () => {
  const p = await patient("Stay Edit Patient");
  const room = await call(
    "/rooms",
    "POST",
    { name: "Stay Edit Room", type: "Private", capacity: 1, rate: 500 },
    201,
  );
  await call(
    `/patients/${p.id}/room`,
    "POST",
    { roomId: room.id, startDate: "2026-09-01" },
    201,
  );
  let ws = await call(`/patients/${p.id}/workspace`);
  const {
    id: _,
    createdAt: __,
    status: ___,
    dischargedAt: ____,
    ...input
  } = ws.patient;
  await call(`/patients/${p.id}`, "PUT", {
    ...input,
    dischargeDate: "2026-09-30",
  });
  ws = await call(`/patients/${p.id}/workspace`);
  assert.equal(ws.roomStays[0].endDate, "2026-09-30");
  assert.equal(
    ws.records.find((r: { kind: string }) => r.kind === "accommodation")
      .quantity,
    30,
  );
  await call(`/patients/${p.id}/discharge`, "POST", {
    date: "2026-09-19",
    summary: "Completed care recorded for the final handover.",
    instructions: "Recorded follow-up instructions.",
    nextVisit: "",
  });
  await call(
    `/patients/${p.id}`,
    "PUT",
    { ...input, dischargeDate: "2026-09-20" },
    409,
  );
  await call(
    "/patients",
    "POST",
    {
      name: "Invalid Direct Room",
      age: 30,
      gender: "Female",
      admissionDate: "2026-09-01",
      dischargeDate: "2026-09-19",
      physician: "Dr. Test",
      room: room.name,
    },
    400,
  );
});
test("voiding unpaid completed-care invoices releases charges for corrected rebilling", async () => {
  const p = await patient("Void Care Patient");
  await call(
    `/patients/${p.id}/assignments`,
    "POST",
    { dates: ["2026-09-01"], sessions: ["Morning"], therapyIds: ["t9"] },
    201,
  );
  const a = (await call(`/patients/${p.id}/workspace`)).assignments[0];
  await call(`/patients/${p.id}/assignments/${a.id}`, "PATCH", {
    status: "Completed",
  });
  const first = await call(
    `/patients/${p.id}/invoices/from-care`,
    "POST",
    { requestId: randomUUID() },
    201,
  );
  await call(`/patients/${p.id}/invoices/${first.id}/void`, "POST");
  const second = await call(
    `/patients/${p.id}/invoices/from-care`,
    "POST",
    { requestId: randomUUID() },
    201,
  );
  assert.notEqual(first.id, second.id);
  assert.equal(second.amount, 450);
  const old = (await call(`/patients/${p.id}/workspace`)).bills.find(
    (b: { id: string }) => b.id === first.id,
  );
  assert.equal(old.status, "Cancelled");
  assert.equal(old.balance, 0);
});
test("note corrections preserve prior text and remain scoped to the patient", async () => {
  const p = await patient("Note Correction Patient");
  const note = await call(
    `/patients/${p.id}/notes`,
    "POST",
    { date: "2026-09-01", session: "Morning", text: "Original procedure note" },
    201,
  );
  await call(
    `/patients/25559/notes/${note.id}`,
    "PATCH",
    { text: "Wrong patient" },
    404,
  );
  await call(`/patients/${p.id}/notes/${note.id}`, "PATCH", {
    text: "Corrected procedure note",
  });
  const ws = await call(`/patients/${p.id}/workspace`);
  assert.equal(ws.notes[0].text, "Corrected procedure note");
  assert.ok(
    ws.audit.some((a: { entity: string }) =>
      a.entity.includes("Original procedure note"),
    ),
  );
});
test("same-day discharge immediately releases the bed for a new admission", async () => {
  const date = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  const p = await call(
    "/patients",
    "POST",
    {
      name: "Same Day Discharge Patient",
      age: 40,
      gender: "Female",
      admissionDate: date,
      dischargeDate: date,
      physician: "Dr. Test",
    },
    201,
  );
  const room = await call(
    "/rooms",
    "POST",
    { name: "Same Day Release Room", type: "Private", capacity: 1, rate: 500 },
    201,
  );
  await call(
    `/patients/${p.id}/room`,
    "POST",
    { roomId: room.id, startDate: date },
    201,
  );
  await call(`/patients/${p.id}/discharge`, "POST", {
    date,
    summary: "Same-day handover recorded by the attending physician.",
    instructions: "Follow the recorded home care instructions.",
    nextVisit: "",
  });
  assert.equal(
    (await call("/rooms")).find((r: { id: string }) => r.id === room.id)
      .available,
    1,
  );
  const next = await call(
    "/patients",
    "POST",
    {
      name: "Same Day New Admission",
      age: 35,
      gender: "Male",
      admissionDate: date,
      dischargeDate: date,
      physician: "Dr. Test",
    },
    201,
  );
  await call(
    `/patients/${next.id}/room`,
    "POST",
    { roomId: room.id, startDate: date },
    201,
  );
});
test("practice and clinician settings save; changing credentials requires the current password", async () => {
  await call("/practice", "PUT", {
    name: "Configured Clinic",
    tagline: "Connected care",
    phone: "1234567890",
    address: "Clinic address",
  });
  assert.equal((await call("/practice")).name, "Configured Clinic");
  await call(
    "/auth/profile",
    "PUT",
    {
      name: "Dr. Updated",
      email: "workflows@vaidya.local",
      newPassword: "new-workflow-password",
    },
    400,
  );
  const user = await call("/auth/profile", "PUT", {
    name: "Dr. Updated",
    email: "workflows@vaidya.local",
  });
  assert.equal(user.name, "Dr. Updated");
  const doctor = await call(
    "/physicians",
    "POST",
    {
      name: "Dr. Directory Test",
      speciality: "Ayurveda",
      phone: "123",
      email: "",
    },
    201,
  );
  assert.ok(doctor.id);
  assert.ok((await call("/dashboard?date=2026-09-01")).activePatients > 0);
});
