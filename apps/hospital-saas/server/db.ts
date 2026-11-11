import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { config } from "./config.ts";
import { upgradeDatabase } from "./migrations.ts";
import { PostgresSyncDatabase } from "./postgres-sync.ts";

const isPostgres = Boolean(process.env.DATABASE_URL);
if (!isPostgres) {
  mkdirSync(dirname(resolve(config.DATABASE_PATH)), { recursive: true });
  mkdirSync(resolve(config.UPLOAD_DIR), { recursive: true });
}
export const db: DatabaseSync = isPostgres
  ? (new PostgresSyncDatabase() as unknown as DatabaseSync)
  : new DatabaseSync(config.DATABASE_PATH);

if (!isPostgres) db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, salt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS patients (id TEXT PRIMARY KEY, name TEXT NOT NULL, age INTEGER NOT NULL, gender TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, admissionDate TEXT NOT NULL, dischargeDate TEXT NOT NULL, nextVisit TEXT NOT NULL, diagnosis TEXT NOT NULL, physician TEXT NOT NULL, room TEXT NOT NULL, bloodGroup TEXT NOT NULL, allergies TEXT NOT NULL, favourite INTEGER NOT NULL DEFAULT 0, vitalsMode TEXT NOT NULL DEFAULT 'three_session', createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS therapies (id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL CHECK(price>=0), duration INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS vitals (id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, date TEXT NOT NULL, session TEXT NOT NULL, time TEXT NOT NULL, height REAL, weight REAL, temperature REAL, pulse REAL, bp TEXT NOT NULL, rr REAL, painScore REAL, fbs REAL, ppbs REAL, rbs REAL, spo2 REAL, sleep TEXT NOT NULL, bowel TEXT NOT NULL, appetite TEXT NOT NULL, UNIQUE(patientId,date,session));
CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, date TEXT NOT NULL, session TEXT NOT NULL, therapyId TEXT NOT NULL REFERENCES therapies(id), status TEXT NOT NULL DEFAULT 'Scheduled', UNIQUE(patientId,date,session,therapyId));
CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, date TEXT NOT NULL, session TEXT NOT NULL, text TEXT NOT NULL, author TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, date TEXT NOT NULL, status TEXT NOT NULL, quantity REAL NOT NULL, amount REAL NOT NULL, session TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, filename TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS inventory (id TEXT PRIMARY KEY, name TEXT NOT NULL, stock REAL NOT NULL CHECK(stock>=0), unit TEXT NOT NULL, price REAL NOT NULL CHECK(price>=0));
CREATE TABLE IF NOT EXISTS bills (id TEXT PRIMARY KEY, patientId TEXT NOT NULL REFERENCES patients(id), title TEXT NOT NULL, amount REAL NOT NULL CHECK(amount>0), status TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, patientId TEXT REFERENCES patients(id), action TEXT NOT NULL, entity TEXT NOT NULL, author TEXT NOT NULL, createdAt TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_vitals_patient ON vitals(patientId,date);
CREATE INDEX IF NOT EXISTS idx_records_patient ON records(patientId,kind);
CREATE INDEX IF NOT EXISTS idx_assignment_patient ON assignments(patientId,date);
CREATE INDEX IF NOT EXISTS idx_audit_patient ON audit(patientId,createdAt);
`);
export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export function transact<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function insert(table: string, data: Record<string, unknown>) {
  const keys = Object.keys(data);
  db.prepare(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
  ).run(...(Object.values(data) as (string | number | null)[]));
}
export function audit(
  patientId: string | null,
  action: string,
  entity: string,
  author: string,
) {
  insert("audit", {
    id: uid(),
    patientId,
    action,
    entity,
    author,
    createdAt: now(),
  });
}
if (isPostgres) db.prepare("SELECT pg_advisory_lock(?)").get(918_442_771);
try {
if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
  const salt = randomBytes(16).toString("hex");
  insert("users", {
    id: uid(),
    name: config.ADMIN_NAME,
    email: config.ADMIN_EMAIL,
    hash: scryptSync(config.ADMIN_PASSWORD, salt, 64).toString("hex"),
    salt,
  });
}
if (config.SEED_DEMO && !db.prepare("SELECT id FROM patients LIMIT 1").get()) {
  transact(() => {
    insert("patients", {
      id: "25559",
      name: "Kailash Kanwar",
      age: 57,
      gender: "Female",
      phone: "",
      address: "Jaipur, Rajasthan",
      admissionDate: "2026-09-01",
      dischargeDate: "2026-09-19",
      nextVisit: "2026-09-12",
      diagnosis: "Sarvangavata",
      physician: config.ADMIN_NAME,
      room: "A-204 · Private",
      bloodGroup: "B+",
      allergies: "None reported",
      favourite: 0,
      vitalsMode: "three_session",
      createdAt: now(),
    });
    const names = [
      "Abhyangam · Sarvanga (full body)",
      "Abhyangam · Sthanika (local)",
      "Abhyanga + Swedan (full)",
      "Cupping therapy",
      "Dhara / Shirodhara · Tailam",
      "Kashaya Basti · Niruha Basti",
      "Kavalgrah / Gandoosh",
      "Kayaseka / Pizhichil",
      "Nasya",
      "Patra Pinda Swedanam",
      "Takradhara",
      "Urobasti / Hridya Basti",
    ];
    names.forEach((name, i) =>
      insert("therapies", {
        id: `t${i + 1}`,
        name,
        category: i % 2 ? "CGHS" : "NON-NABH",
        price: [750, 400, 950, 600, 1200, 800, 350, 1500, 450, 900, 1100, 700][
          i
        ],
        duration: [45, 30, 60, 30, 45, 30, 20, 60, 20, 45, 45, 30][i],
      }),
    );
    for (let day = 1; day <= 10; day++) {
      const date = `2026-09-${String(day).padStart(2, "0")}`;
      for (const therapyId of ["t1", "t8", "t6"])
        insert("assignments", {
          id: uid(),
          patientId: "25559",
          date,
          session: "Morning",
          therapyId,
          status: day < 8 ? "Completed" : "Scheduled",
        });
      if ([1, 3, 6, 8].includes(day))
        insert("assignments", {
          id: uid(),
          patientId: "25559",
          date,
          session: "Noon",
          therapyId: "t5",
          status: day < 8 ? "Completed" : "Scheduled",
        });
      if ([1, 4, 6, 8, 9, 10].includes(day))
        insert("assignments", {
          id: uid(),
          patientId: "25559",
          date,
          session: "Evening",
          therapyId: "t10",
          status: day < 8 ? "Completed" : "Scheduled",
        });
    }
    for (const [day, session, pulse, pain] of [
      [1, "Morning", 80, 8],
      [7, "Morning", 78, 6],
      [8, "Morning", 76, 5],
    ] as const)
      insert("vitals", {
        id: uid(),
        patientId: "25559",
        date: `2026-09-${String(day).padStart(2, "0")}`,
        session,
        time: "08:30",
        height: 160,
        weight: 80,
        temperature: 37,
        pulse,
        bp: "120/80",
        rr: 18,
        painScore: pain,
        fbs: null,
        ppbs: null,
        rbs: null,
        spo2: 99,
        sleep: "Regular",
        bowel: "Constipation",
        appetite: "Normal",
      });
    const record = (
      kind: string,
      title: string,
      detail: string,
      date = "2026-09-01",
      status = "Active",
      quantity = 1,
      amount = 0,
      session = "",
    ) =>
      insert("records", {
        id: uid(),
        patientId: "25559",
        kind,
        title,
        detail,
        date,
        status,
        quantity,
        amount,
        session,
        createdAt: now(),
      });
    record(
      "history",
      "Generalised pain with stiffness",
      "7 years · Multiple joint pain in ankles, knees, lower back and neck. Difficulty walking for 2 months. Weakness and disturbed sleep.",
      "2026-09-01",
      "Recorded",
    );
    record(
      "accommodation",
      "Private room · A-204",
      "Ayurveda wing · Second floor · Attendant bed included",
      "2026-09-01",
      "Occupied",
      19,
      2000,
    );
    const meds = [
      ["Punchatikthakam ghrutham", "10 ml - 0 - 0 · With lukewarm water", 1],
      ["Ksheerabala 101 Avartana", "2 U - 0 - 2 U · With lukewarm water", 40],
      ["Kaisoraguggulu", "2 tablets - 0 - 2 tablets · With lukewarm water", 40],
      [
        "Aamavatari Rasa",
        "2 tablets - 0 - 2 tablets · With lukewarm water",
        40,
      ],
      ["Dashmoola Kashaya", "20 ml - 0 - 20 ml · With equal water", 400],
      ["Vaiswanara Churna", "5 gm - 0 - 5 gm · With lukewarm water", 25],
    ] as const;
    meds.forEach(([title, detail, quantity]) =>
      record(
        "prescription",
        title,
        detail,
        "2026-09-01",
        "Active",
        quantity,
        0,
        "Morning / Evening",
      ),
    );
    record(
      "diet",
      "Warm, light meals",
      "Breakfast: rice porridge · Lunch: moong dal khichdi · Dinner: vegetable soup. Follow the treating clinician’s instructions.",
      "2026-09-08",
      "Active",
    );
    record(
      "investigation",
      "Complete blood count",
      "Baseline investigation · Report awaited",
      "2026-09-08",
      "Pending",
    );
    record(
      "program",
      "Morning consultation",
      "Review with attending physician",
      "2026-09-08",
      "Scheduled",
      1,
      0,
      "09:00",
    );
    record(
      "program",
      "Guided relaxation",
      "Gentle supervised session",
      "2026-09-08",
      "Scheduled",
      1,
      0,
      "16:00",
    );
    meds.forEach(([name], i) =>
      insert("inventory", {
        id: uid(),
        name,
        stock: 100 + i * 20,
        unit: i === 4 ? "ml" : "units",
        price: 80 + i * 25,
      }),
    );
    audit("25559", "Reference case initialized", "Patient workspace", "System");
  });
}
} finally {
  if (isPostgres) db.prepare("SELECT pg_advisory_unlock(?)").get(918_442_771);
}
if (!isPostgres) upgradeDatabase(db as DatabaseSync);
