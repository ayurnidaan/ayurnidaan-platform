import { Worker } from "node:worker_threads";

type Row = Record<string, unknown>;
type RunResult = { changes: number };

const camelCaseColumns = [
  "userId",
  "patientId",
  "admissionDate",
  "dischargeDate",
  "nextVisit",
  "bloodGroup",
  "vitalsMode",
  "createdAt",
  "dischargedAt",
  "therapyId",
  "unitPriceCents",
  "estimateId",
  "painScore",
  "reorderLevel",
  "paidCents",
  "requestId",
  "billId",
  "amountCents",
  "inventoryId",
  "scheduledAt",
  "invoiceId",
  "batchId",
  "recordId",
  "roomId",
  "startDate",
  "endDate",
] as const;

function translate(source: string) {
  let index = 0;
  let sql = source
    .replace(/BEGIN IMMEDIATE/gi, "BEGIN")
    .replace(/name\s+COLLATE\s+NOCASE/gi, "lower(name)")
    .replace(/\b([a-z]\.)?rowid\b/gi, (_match, qualifier = "") => `${qualifier}id`)
    .replace(/\?/g, () => `$${++index}`);
  for (const column of camelCaseColumns)
    sql = sql.replace(new RegExp(`\\b${column}\\b`, "g"), `"${column}"`);
  return sql;
}

export class PostgresSyncDatabase {
  readonly isPostgres = true;
  private readonly worker: Worker;

  constructor() {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    this.worker = new Worker(new URL("./postgres-worker.mjs", import.meta.url));
  }

  private query<T>(sql: string, params: unknown[], mode: "get" | "all" | "run" | "exec"): T {
    const buffer = new SharedArrayBuffer(16 + 16 * 1024 * 1024);
    const state = new Int32Array(buffer, 0, 4);
    this.worker.postMessage({ sql: translate(sql), params, mode, buffer });
    const wait = Atomics.wait(state, 0, 0, 30_000);
    if (wait === "timed-out") throw new Error("Database query timed out");
    const length = Atomics.load(state, 1);
    const json = new TextDecoder().decode(new Uint8Array(buffer, 16, length));
    const response = JSON.parse(json) as { ok: boolean; value?: T; error?: string };
    if (!response.ok) throw new Error(response.error || "Database query failed");
    return response.value as T;
  }

  prepare(sql: string) {
    return {
      get: (...params: unknown[]) => this.query<Row | undefined>(sql, params, "get") ?? undefined,
      all: (...params: unknown[]) => this.query<Row[]>(sql, params, "all"),
      run: (...params: unknown[]) => this.query<RunResult>(sql, params, "run"),
    };
  }

  exec(sql: string) {
    this.query<null>(sql, [], "exec");
  }

  close() {
    void this.worker.terminate();
  }
}
