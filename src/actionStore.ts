import { Pool } from "pg";
import { getPool } from "./db";
import crypto from "crypto";

export interface ActionRecord {
  id?: number;
  customerId: string;
  action: string;
  reason: string;
  metadata?: Record<string, unknown>;
  hash: string;
  status: "pending" | "completed" | "failed" | "duplicate";
  result?: Record<string, unknown>;
  createdAt?: number;
  updatedAt?: number;
}

export interface IActionStore {
  kind: "postgres" | "memory";
  findByHash(hash: string): Promise<ActionRecord | null> | ActionRecord | null;
  save(record: ActionRecord): Promise<ActionRecord> | ActionRecord;
}

class MemoryActionStore implements IActionStore {
  kind: "memory" = "memory";
  private store = new Map<string, ActionRecord>();

  findByHash(hash: string) {
    return this.store.get(hash) || null;
  }

  save(record: ActionRecord) {
    const now = Date.now();
    const toSave: ActionRecord = { ...record, createdAt: now, updatedAt: now };
    this.store.set(record.hash, toSave);
    return toSave;
  }
}

class PostgresActionStore implements IActionStore {
  kind: "postgres" = "postgres";
  constructor(private pool: Pool) {}

  async findByHash(hash: string) {
    const res = await this.pool.query("SELECT * FROM actions WHERE hash = $1 LIMIT 1", [hash]);
    const row = res.rows[0];
    return row ? mapRow(row) : null;
  }

  async save(record: ActionRecord) {
    const res = await this.pool.query(
      `
        INSERT INTO actions (customer_id, action, reason, metadata, hash, status, result, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (hash) DO UPDATE SET
          status = EXCLUDED.status,
          result = EXCLUDED.result,
          updated_at = NOW()
        RETURNING *;
      `,
      [
        record.customerId,
        record.action,
        record.reason,
        record.metadata || null,
        record.hash,
        record.status,
        record.result || null,
      ],
    );
    return mapRow(res.rows[0]);
  }
}

function mapRow(row: any): ActionRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    action: row.action,
    reason: row.reason,
    metadata: row.metadata || undefined,
    hash: row.hash,
    status: row.status,
    result: row.result || undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

async function createActionStore(): Promise<IActionStore> {
  const pool = getPool();
  if (pool) {
    return new PostgresActionStore(pool);
  }
  return new MemoryActionStore();
}

export function hashAction(input: { action: string; reason: string; metadata?: Record<string, unknown> }) {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify({ action: input.action, reason: input.reason, metadata: input.metadata || null }));
  return hash.digest("hex");
}

export const actionStorePromise = createActionStore();
