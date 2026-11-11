import "dotenv/config";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync, existsSync, cpSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
const source = resolve(process.env.DATABASE_PATH || "data/vaidya.sqlite");
if (!existsSync(source)) {
  console.log("No existing database to back up.");
  process.exit(0);
}
const folder = resolve(
  "data/backups",
  new Date().toISOString().replace(/[:.]/g, "-"),
);
mkdirSync(folder, { recursive: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  await backup(db, join(folder, "database.sqlite"));
} finally {
  db.close();
}
const uploads = resolve(process.env.UPLOAD_DIR || "uploads");
if (existsSync(uploads))
  cpSync(uploads, join(folder, "uploads"), {
    recursive: true,
    errorOnExist: true,
  });
writeFileSync(
  join(folder, "manifest.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      database: "database.sqlite",
      uploads: existsSync(uploads) ? "uploads" : null,
    },
    null,
    2,
  ),
);
console.log("Consistent database and uploaded-file backup saved to " + folder);
