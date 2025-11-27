import { getPool } from "./db";

export type MessageRole = "user" | "assistant" | "system" | "action";

export async function logMessage(params: {
  customerId: string;
  role: MessageRole;
  content: string;
  threadUuid?: string;
}) {
  const pool = getPool();
  if (!pool) return;
  const { customerId, role, content, threadUuid } = params;
  const truncated = content.length > 10_000 ? content.slice(0, 10_000) : content;
  await pool.query(
    `INSERT INTO customers (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING`,
    [customerId],
  );
  await pool.query(
    `INSERT INTO messages (customer_id, role, content, thread_uuid) VALUES ($1, $2, $3, $4)`,
    [customerId, role, truncated, threadUuid || null],
  );
}
