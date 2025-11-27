import { getPool } from "./db";

export async function collectDbMetrics() {
  const pool = getPool();
  if (!pool) return null;
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        (SELECT count(*) FROM sessions)::int AS sessions,
        (SELECT count(*) FROM messages)::int AS messages,
        (SELECT count(*) FROM actions)::int AS actions
    `);
    return rows[0];
  } catch {
    return null;
  } finally {
    client.release();
  }
}
