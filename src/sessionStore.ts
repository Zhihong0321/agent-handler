import { Pool } from "pg";
import { config } from "./config";
import { ensureTables, getPool } from "./db";
import { QueryMode, SessionState, SessionStatus } from "./types";

type SessionOverrides = Partial<
  Pick<
    SessionState,
    | "accountName"
    | "collectionUuid"
    | "backendUuid"
    | "frontendContextUuid"
    | "mode"
    | "language"
    | "sources"
    | "lastQuery"
    | "state"
  >
>;

export interface ISessionStore {
  kind: "postgres" | "memory";
  get(customerId: string): Promise<SessionState | undefined> | SessionState | undefined;
  upsert(customerId: string, overrides?: SessionOverrides): Promise<SessionState> | SessionState;
  updateThreadIdentifiers(
    customerId: string,
    backendUuid?: string | null,
    frontendContextUuid?: string | null,
  ): Promise<void> | void;
  reset(customerId: string): Promise<void> | void;
  all(): Promise<SessionState[]> | SessionState[];
}

class InMemorySessionStore implements ISessionStore {
  private store = new Map<string, SessionState>();
  kind: "memory" = "memory";

  constructor(private defaultAccount: string | null, private defaultCollection: string | null) {}

  get(customerId: string) {
    return this.store.get(customerId);
  }

  upsert(customerId: string, overrides?: SessionOverrides) {
    const existing = this.store.get(customerId);
    const account =
      overrides?.accountName || existing?.accountName || this.defaultAccount || null;
    if (!account) {
      throw new Error("account_name is required for session");
    }

    const next: SessionState = {
      customerId,
      accountName: account,
      collectionUuid:
        overrides?.collectionUuid !== undefined
          ? overrides.collectionUuid
          : existing?.collectionUuid ?? this.defaultCollection ?? null,
      backendUuid:
        overrides?.backendUuid !== undefined
          ? overrides.backendUuid
          : existing?.backendUuid ?? null,
      frontendContextUuid:
        overrides?.frontendContextUuid !== undefined
          ? overrides.frontendContextUuid
          : existing?.frontendContextUuid ?? null,
      language: overrides?.language || existing?.language || "en-US",
      mode: overrides?.mode || existing?.mode || "auto",
      sources: overrides?.sources || existing?.sources || "web",
      lastQuery: overrides?.lastQuery ?? existing?.lastQuery,
      state: overrides?.state || existing?.state || "bot",
      updatedAt: Date.now(),
    };

    this.store.set(customerId, next);
    return next;
  }

  updateThreadIdentifiers(customerId: string, backendUuid?: string | null, frontendContextUuid?: string | null) {
    const existing = this.store.get(customerId);
    if (!existing) return;
    this.store.set(customerId, {
      ...existing,
      backendUuid: backendUuid ?? existing.backendUuid ?? null,
      frontendContextUuid: frontendContextUuid ?? existing.frontendContextUuid ?? null,
      updatedAt: Date.now(),
    });
  }

  reset(customerId: string) {
    if (this.store.has(customerId)) {
      this.store.delete(customerId);
    }
  }

  all() {
    return Array.from(this.store.values());
  }
}

class PostgresSessionStore implements ISessionStore {
  kind: "postgres" = "postgres";
  constructor(
    private pool: Pool,
    private defaultAccount: string | null,
    private defaultCollection: string | null,
  ) {}

  async get(customerId: string) {
    const res = await this.pool.query("SELECT * FROM sessions WHERE customer_id = $1 LIMIT 1", [
      customerId,
    ]);
    const row = res.rows[0];
    return row ? mapRowToSession(row) : undefined;
  }

  async upsert(customerId: string, overrides?: SessionOverrides) {
    const existing = await this.get(customerId);
    const account =
      overrides?.accountName || existing?.accountName || this.defaultAccount || null;
    if (!account) {
      throw new Error("account_name is required for session");
    }

    const collectionUuid =
      overrides?.collectionUuid !== undefined
        ? overrides.collectionUuid
        : existing?.collectionUuid ?? this.defaultCollection ?? null;
    const backendUuid =
      overrides?.backendUuid !== undefined
        ? overrides.backendUuid
        : existing?.backendUuid ?? null;
    const frontendContextUuid =
      overrides?.frontendContextUuid !== undefined
        ? overrides.frontendContextUuid
        : existing?.frontendContextUuid ?? null;
    const mode: QueryMode = overrides?.mode || existing?.mode || "auto";
    const language = overrides?.language || existing?.language || "en-US";
    const sources = overrides?.sources || existing?.sources || "web";
    const lastQuery = overrides?.lastQuery ?? existing?.lastQuery ?? null;
    const state: SessionStatus = overrides?.state || existing?.state || "bot";

    await this.pool.query(
      `
        INSERT INTO customers (customer_id) VALUES ($1)
        ON CONFLICT (customer_id) DO NOTHING;
      `,
      [customerId],
    );

    const result = await this.pool.query(
      `
        INSERT INTO sessions (
          customer_id, account_name, collection_uuid, backend_uuid, frontend_context_uuid,
          language, mode, sources, last_query, handoff_state, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (customer_id) DO UPDATE SET
          account_name = EXCLUDED.account_name,
          collection_uuid = EXCLUDED.collection_uuid,
          backend_uuid = COALESCE($4, sessions.backend_uuid),
          frontend_context_uuid = COALESCE($5, sessions.frontend_context_uuid),
          language = EXCLUDED.language,
          mode = EXCLUDED.mode,
          sources = EXCLUDED.sources,
          last_query = EXCLUDED.last_query,
          handoff_state = EXCLUDED.handoff_state,
          updated_at = NOW()
        RETURNING *;
      `,
      [
        customerId,
        account,
        collectionUuid,
        backendUuid,
        frontendContextUuid,
        language,
        mode,
        sources,
        lastQuery,
        state,
      ],
    );

    return mapRowToSession(result.rows[0]);
  }

  async updateThreadIdentifiers(customerId: string, backendUuid?: string | null, frontendContextUuid?: string | null) {
    await this.pool.query(
      `
        UPDATE sessions
        SET backend_uuid = COALESCE($2, backend_uuid),
            frontend_context_uuid = COALESCE($3, frontend_context_uuid),
            updated_at = NOW()
        WHERE customer_id = $1;
      `,
      [customerId, backendUuid ?? null, frontendContextUuid ?? null],
    );
  }

  async reset(customerId: string) {
    await this.pool.query("DELETE FROM sessions WHERE customer_id = $1", [customerId]);
    await this.pool.query("DELETE FROM customers WHERE customer_id = $1", [customerId]);
  }

  async all() {
    const res = await this.pool.query("SELECT * FROM sessions ORDER BY updated_at DESC");
    return res.rows.map(mapRowToSession);
  }
}

function mapRowToSession(row: any): SessionState {
  return {
    customerId: row.customer_id,
    accountName: row.account_name,
    collectionUuid: row.collection_uuid,
    backendUuid: row.backend_uuid,
    frontendContextUuid: row.frontend_context_uuid,
    language: row.language,
    mode: row.mode,
    sources: row.sources,
    lastQuery: row.last_query ?? undefined,
    state: row.handoff_state || "bot",
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

async function createSessionStore(): Promise<ISessionStore> {
  const pool = getPool();
  if (pool) {
    try {
      await ensureTables();
      return new PostgresSessionStore(pool, config.defaultAccount, config.defaultCollectionUuid);
    } catch (err) {
      console.error("FATAL: Session store init failed (Postgres configured but failed to connect/init)", err);
      throw err;
    }
  }
  console.warn("WARN: POSTGRES_URL not set. Using In-Memory Session Store. DATA WILL BE LOST on restart.");
  return new InMemorySessionStore(config.defaultAccount, config.defaultCollectionUuid);
}

export const sessionStorePromise = createSessionStore();
