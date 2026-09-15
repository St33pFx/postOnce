import { createConnection } from "./connection";

export async function probeDatabase() {
  const { pool } = createConnection();
  try {
    // Query expected columns as well as connectivity: an unmigrated DB is not ready.
    await pool.query(`
      SELECT u.id, u.created_at, d.id, d.user_id, d.caption, d.created_at, d.updated_at
      FROM postonce_users u LEFT JOIN drafts d ON d.user_id = u.id LIMIT 0
    `);
  } finally {
    await pool.end();
  }
}
