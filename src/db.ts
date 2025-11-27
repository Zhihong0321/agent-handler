import { Pool } from "pg";
import { config } from "./config";

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

export function getPool() {
  if (pool) return pool;
  if (!config.postgresUrl) return null;
  pool = new Pool({
    connectionString: config.postgresUrl,
    max: config.postgresMaxConnections,
  });
  return pool;
}

export async function ensureTables() {
  const client = getPool();
  if (!client) return;

  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log("Initializing database tables...");
    try {
      await client.query(`
    CREATE TABLE IF NOT EXISTS customers (
      customer_id TEXT PRIMARY KEY,
      profile_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      customer_id TEXT PRIMARY KEY REFERENCES customers(customer_id) ON DELETE CASCADE,
      account_name TEXT NOT NULL,
      collection_uuid TEXT,
      backend_uuid TEXT,
      frontend_context_uuid TEXT,
      language TEXT NOT NULL DEFAULT 'en-US',
      mode TEXT NOT NULL DEFAULT 'auto',
      sources TEXT NOT NULL DEFAULT 'web',
      last_query TEXT,
      handoff_state TEXT NOT NULL DEFAULT 'bot',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS handoff_state TEXT NOT NULL DEFAULT 'bot';

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      thread_uuid TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_uuid TEXT;

    CREATE INDEX IF NOT EXISTS idx_messages_customer_id_created_at ON messages(customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_thread_uuid ON messages(thread_uuid);

    CREATE TABLE IF NOT EXISTS actions (
      id BIGSERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      metadata JSONB,
      hash TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL,
      result JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_actions_customer_id_created_at ON actions(customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_actions_hash ON actions(hash);

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_name TEXT NOT NULL,
      collection_uuid TEXT,
      model TEXT,
      mode TEXT,
      sources TEXT,
      language TEXT,
      answer_only BOOLEAN,
      incognito BOOLEAN,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tester_threads (
      tester_id TEXT NOT NULL,
      thread_uuid TEXT NOT NULL,
      title TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tester_id, thread_uuid)
    );

    CREATE TABLE IF NOT EXISTS thread_comments (
      id BIGSERIAL PRIMARY KEY,
      thread_uuid TEXT NOT NULL,
      tester_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
      console.log("Database tables initialized successfully");
    } catch (err) {
      console.error("Failed to initialize database tables", err);
      // Reset promise so we can retry if needed, though usually we crash here
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}
