import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export function upgradeDatabase(db: DatabaseSync) {
  if (Number(db.prepare("PRAGMA user_version").get()?.user_version) >= 2)
    return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`ALTER TABLE patients ADD COLUMN status TEXT NOT NULL DEFAULT 'Admitted';
ALTER TABLE patients ADD COLUMN dischargedAt TEXT NOT NULL DEFAULT '';
ALTER TABLE therapies ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assignments ADD COLUMN unitPriceCents INTEGER NOT NULL DEFAULT -1;
ALTER TABLE assignments ADD COLUMN estimateId TEXT;
ALTER TABLE records ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}';
ALTER TABLE inventory ADD COLUMN reorderLevel REAL NOT NULL DEFAULT 10;
ALTER TABLE bills ADD COLUMN number TEXT NOT NULL DEFAULT '';
ALTER TABLE bills ADD COLUMN paidCents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN requestId TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_request ON bills(requestId) WHERE requestId IS NOT NULL;
CREATE TABLE bill_items(id TEXT PRIMARY KEY,billId TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,description TEXT NOT NULL,quantity REAL NOT NULL,unitPriceCents INTEGER NOT NULL,amountCents INTEGER NOT NULL,source TEXT UNIQUE);
CREATE TABLE payments(id TEXT PRIMARY KEY,billId TEXT NOT NULL REFERENCES bills(id),amountCents INTEGER NOT NULL CHECK(amountCents>0),method TEXT NOT NULL,reference TEXT NOT NULL,date TEXT NOT NULL,author TEXT NOT NULL,createdAt TEXT NOT NULL);
CREATE TABLE stock_movements(id TEXT PRIMARY KEY,inventoryId TEXT NOT NULL REFERENCES inventory(id),patientId TEXT REFERENCES patients(id),delta REAL NOT NULL,reason TEXT NOT NULL,author TEXT NOT NULL,createdAt TEXT NOT NULL);
CREATE TABLE estimate_batches(id TEXT PRIMARY KEY,patientId TEXT NOT NULL REFERENCES patients(id),session TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'Draft',scheduledAt TEXT NOT NULL DEFAULT '',invoiceId TEXT REFERENCES bills(id),createdAt TEXT NOT NULL);
CREATE TABLE estimate_lines(id TEXT PRIMARY KEY,batchId TEXT NOT NULL REFERENCES estimate_batches(id),recordId TEXT UNIQUE NOT NULL REFERENCES records(id) ON DELETE CASCADE,therapyId TEXT NOT NULL REFERENCES therapies(id),days INTEGER NOT NULL,unitPriceCents INTEGER NOT NULL);
CREATE TABLE rooms(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,type TEXT NOT NULL,capacity INTEGER NOT NULL,rate REAL NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE room_stays(id TEXT PRIMARY KEY,patientId TEXT NOT NULL REFERENCES patients(id),roomId TEXT NOT NULL REFERENCES rooms(id),startDate TEXT NOT NULL,endDate TEXT NOT NULL,rate REAL NOT NULL,status TEXT NOT NULL,recordId TEXT NOT NULL REFERENCES records(id));
CREATE UNIQUE INDEX idx_active_room_stay ON room_stays(patientId) WHERE status='Active';
CREATE TABLE physicians(id TEXT PRIMARY KEY,name TEXT UNIQUE NOT NULL,speciality TEXT NOT NULL,phone TEXT NOT NULL,email TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE practice(id INTEGER PRIMARY KEY CHECK(id=1),name TEXT NOT NULL,tagline TEXT NOT NULL,phone TEXT NOT NULL,address TEXT NOT NULL);
INSERT INTO practice VALUES(1,'Healthier India','Ayurveda & wellness','','');
CREATE INDEX idx_bill_patient ON bills(patientId,createdAt);
CREATE INDEX idx_payment_bill ON payments(billId);
CREATE INDEX idx_stock_item ON stock_movements(inventoryId,createdAt);
CREATE INDEX idx_room_stays ON room_stays(roomId,status);
UPDATE assignments SET unitPriceCents=CAST(ROUND((SELECT price FROM therapies WHERE therapies.id=assignments.therapyId)*100) AS INTEGER);
PRAGMA user_version=2;`);
    const stamp = new Date().toISOString();
    for (const bill of db.prepare("SELECT * FROM bills").all()) {
      const cents = Math.round(Number(bill.amount) * 100),
        paid = bill.status === "Paid" ? cents : 0;
      db.prepare("UPDATE bills SET number=?,paidCents=? WHERE id=?").run(
        `INV-${String(bill.id).slice(0, 8).toUpperCase()}`,
        paid,
        String(bill.id),
      );
      db.prepare("INSERT INTO bill_items VALUES(?,?,?,?,?,?,?)").run(
        randomUUID(),
        String(bill.id),
        String(bill.title),
        1,
        cents,
        cents,
        null,
      );
      if (paid)
        db.prepare("INSERT INTO payments VALUES(?,?,?,?,?,?,?,?)").run(
          randomUUID(),
          String(bill.id),
          paid,
          "Legacy",
          "Migrated recorded payment",
          String(bill.createdAt).slice(0, 10),
          "System",
          stamp,
        );
    }
    const roomInsert = db.prepare(
      "INSERT OR IGNORE INTO rooms VALUES(?,?,?,?,?,1)",
    );
    roomInsert.run("room-a204", "A-204", "Private", 1, 2000);
    roomInsert.run("room-a205", "A-205", "Private", 1, 2000);
    roomInsert.run("room-b101", "B-101", "Shared", 2, 1200);
    roomInsert.run("room-c101", "C-101", "General", 4, 800);
    for (const p of db.prepare("SELECT * FROM patients").all()) {
      db.prepare("INSERT OR IGNORE INTO physicians VALUES(?,?,?,?,?,1)").run(
        randomUUID(),
        String(p.physician),
        "Ayurveda",
        "",
        "",
      );
      if (!p.room || p.room === "Unassigned") continue;
      const name = String(p.room).split(" · ")[0];
      const record = db
        .prepare(
          "SELECT * FROM records WHERE patientId=? AND kind='accommodation' AND status='Occupied' ORDER BY date DESC LIMIT 1",
        )
        .get(String(p.id));
      roomInsert.run(
        randomUUID(),
        name,
        "Private",
        1,
        Number(record?.amount ?? 0),
      );
      const room = db.prepare("SELECT id FROM rooms WHERE name=?").get(name)!;
      let recordId = record?.id;
      if (!recordId) {
        recordId = randomUUID();
        db.prepare(
          "INSERT INTO records(id,patientId,kind,title,detail,date,status,quantity,amount,session,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          recordId,
          String(p.id),
          "accommodation",
          String(p.room),
          "Existing room assignment",
          String(p.admissionDate),
          "Occupied",
          Math.max(
            1,
            1 +
              (Date.parse(String(p.dischargeDate)) -
                Date.parse(String(p.admissionDate))) /
                86400000,
          ),
          Number(record?.amount ?? 0),
          "",
          stamp,
        );
      }
      db.prepare("INSERT INTO room_stays VALUES(?,?,?,?,?,?,?,?)").run(
        randomUUID(),
        String(p.id),
        String(room.id),
        String(p.admissionDate),
        String(p.dischargeDate),
        Number(record?.amount ?? 0),
        "Active",
        String(recordId),
      );
    }
    for (const u of db.prepare("SELECT name FROM users").all())
      db.prepare("INSERT OR IGNORE INTO physicians VALUES(?,?,?,?,?,1)").run(
        randomUUID(),
        String(u.name),
        "Ayurveda",
        "",
        "",
      );
    for (const record of db
      .prepare("SELECT * FROM records WHERE kind='prescription'")
      .all()) {
      const item = db
        .prepare("SELECT id FROM inventory WHERE lower(name)=lower(?)")
        .get(String(record.title));
      db.prepare("UPDATE records SET metadata=? WHERE id=?").run(
        JSON.stringify({
          inventoryId: item?.id ?? "",
          dose: String(record.detail),
          frequency: String(record.session || "As directed"),
          days: 10,
          instructions: "",
          dispensedQuantity: 0,
        }),
        String(record.id),
      );
    }
    for (const r of db
      .prepare("SELECT * FROM records WHERE kind='estimate'")
      .all()) {
      const t = db
        .prepare("SELECT id,price FROM therapies WHERE name=?")
        .get(String(r.title));
      if (!t) continue;
      const batch = randomUUID();
      db.prepare(
        "INSERT INTO estimate_batches(id,patientId,session,createdAt) VALUES(?,?,?,?)",
      ).run(batch, String(r.patientId), String(r.session), String(r.createdAt));
      db.prepare("INSERT INTO estimate_lines VALUES(?,?,?,?,?,?)").run(
        randomUUID(),
        batch,
        String(r.id),
        String(t.id),
        Number(r.quantity),
        Math.round(
          (Number(r.amount) * 100) /
            Number(r.quantity) /
            (r.session === "All" ? 3 : 1),
        ),
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
