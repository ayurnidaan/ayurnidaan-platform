import { createClient } from "@supabase/supabase-js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { config } from "./config.ts";

const bucket = "patient-documents";
const remote =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export async function storeDocument(path: string, data: Buffer, contentType: string) {
  if (!remote) {
    const local = resolve(config.UPLOAD_DIR, path);
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, data);
    return;
  }
  const { error } = await remote.storage.from(bucket).upload(path, data, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
}

export async function loadDocument(path: string) {
  if (!remote) {
    const local = resolve(config.UPLOAD_DIR, path);
    if (!existsSync(local)) return null;
    return readFileSync(local);
  }
  const { data, error } = await remote.storage.from(bucket).download(path);
  if (error) {
    if (error.message.toLowerCase().includes("not found")) return null;
    throw error;
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function removeDocument(path: string) {
  if (!remote) {
    const local = resolve(config.UPLOAD_DIR, path);
    if (existsSync(local)) unlinkSync(local);
    return;
  }
  const { error } = await remote.storage.from(bucket).remove([path]);
  if (error) throw error;
}
