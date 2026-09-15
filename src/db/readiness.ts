import { createConnection } from "./connection";

export async function probeDatabase() {
  const { pool } = createConnection();
  try {
    // Query expected columns as well as connectivity: an unmigrated DB is not ready.
    await pool.query(`
      SELECT u.id, u.created_at, d.id, d.user_id, d.caption, d.created_at, d.updated_at
      FROM postonce_users u LEFT JOIN drafts d ON d.user_id = u.id LIMIT 0
    `);
    await pool.query(`SELECT u.id, u.auth_user_id, a.id, s.expires_at, c.token_envelope, b.requires_confirmation
      FROM postonce_users u LEFT JOIN auth_user a ON a.id = u.auth_user_id
      LEFT JOIN auth_session s ON s.user_id = a.id
      LEFT JOIN connected_accounts c ON c.user_id = u.id
      LEFT JOIN draft_connection_bindings b ON b.user_id = u.id LIMIT 0`);
  } finally {
    await pool.end();
  }
}
