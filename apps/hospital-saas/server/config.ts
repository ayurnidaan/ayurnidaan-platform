import "dotenv/config";
import { z } from "zod";
const bool = z.enum(["true", "false"]).transform((v) => v === "true");
export const config = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    APP_ORIGIN: z.url().default("http://localhost:5173"),
    DATABASE_PATH: z.string().default("./data/vaidya.sqlite"),
    UPLOAD_DIR: z.string().default("./uploads"),
    ADMIN_EMAIL: z.email().default("doctor@vaidya.local"),
    ADMIN_NAME: z.string().default("Dr. Ananya Sharma"),
    ADMIN_PASSWORD: z
      .string()
      .min(12, "Set ADMIN_PASSWORD to at least 12 characters in .env"),
    SEED_DEMO: bool.default(false),
    COOKIE_SECURE: bool.default(false),
  })
  .parse(process.env);
if (config.NODE_ENV === "production" && !config.COOKIE_SECURE)
  throw new Error("Production requires COOKIE_SECURE=true and HTTPS.");
