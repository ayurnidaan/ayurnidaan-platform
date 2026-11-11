import { parentPort } from "node:worker_threads";
import pg from "pg";

const { Client, types } = pg;
types.setTypeParser(20, Number);
types.setTypeParser(1700, Number);

const databaseUrl = new URL(process.env.DATABASE_URL);
if (process.env.SUPABASE_POOLER_HOST)
  databaseUrl.hostname = process.env.SUPABASE_POOLER_HOST;

const client = new Client({
  connectionString: databaseUrl.toString(),
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

const connection = client.connect();

const encoder = new TextEncoder();

parentPort.on("message", async ({ sql, params, mode, buffer }) => {
  const state = new Int32Array(buffer, 0, 4);
  const bytes = new Uint8Array(buffer, 16);
  try {
    await connection;
    const result = await client.query(sql, params);
    const last = Array.isArray(result) ? result.at(-1) : result;
    const value =
      mode === "get"
        ? last?.rows?.[0] ?? null
        : mode === "all"
          ? last?.rows ?? []
          : mode === "run"
            ? { changes: last?.rowCount ?? 0 }
            : null;
    const payload = encoder.encode(JSON.stringify({ ok: true, value }));
    if (payload.length > bytes.length) throw new Error("Database response exceeded the synchronous bridge buffer");
    bytes.set(payload);
    Atomics.store(state, 1, payload.length);
    Atomics.store(state, 2, 0);
  } catch (error) {
    const payload = encoder.encode(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    bytes.set(payload.subarray(0, bytes.length));
    Atomics.store(state, 1, Math.min(payload.length, bytes.length));
    Atomics.store(state, 2, 1);
  } finally {
    Atomics.store(state, 0, 1);
    Atomics.notify(state, 0);
  }
});
