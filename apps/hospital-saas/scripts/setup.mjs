import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  const template = readFileSync(".env.example", "utf8");
  writeFileSync(
    ".env",
    template.replace(
      "ADMIN_PASSWORD=",
      "ADMIN_PASSWORD=" + randomBytes(24).toString("base64url"),
    ),
    { mode: 0o600 },
  );
  console.log(
    "Local configuration created in .env with a random administrator password. Open .env to find your sign-in credentials.",
  );
} else console.log(".env already exists; configuration preserved.");
