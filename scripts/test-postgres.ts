import "dotenv/config";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createConnection } from "../src/db/connection";

// Must target a dedicated disposable test database. No tables are dropped.
async function main() {
  if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL required");
  const { db, pool } = createConnection({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL });
  try {
    await migrate(db, { migrationsFolder: "src/db/migrations" });
    await migrate(db, { migrationsFolder: "src/db/migrations" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const user = await client.query("INSERT INTO postonce_users DEFAULT VALUES RETURNING id");
      const draft = await client.query("INSERT INTO drafts (user_id, caption) VALUES ($1, $2) RETURNING *", [user.rows[0].id, "persisted"]);
      assert.equal(draft.rows[0].caption, "persisted");
      await client.query("SAVEPOINT orphan");
      await assert.rejects(client.query("INSERT INTO drafts (user_id) VALUES ($1)", [crypto.randomUUID()]),
        (error: unknown) => (error as { code: string }).code === "23503");
      await client.query("ROLLBACK TO SAVEPOINT orphan");
      await client.query("SAVEPOINT deletion");
      await assert.rejects(client.query("DELETE FROM postonce_users WHERE id=$1", [user.rows[0].id]),
        (error: unknown) => (error as { code: string }).code === "23503");
      await client.query("ROLLBACK TO SAVEPOINT deletion");
      await client.query("ROLLBACK");
      const rolledBack = await client.query("SELECT id FROM drafts WHERE id=$1", [draft.rows[0].id]);
      assert.equal(rolledBack.rowCount, 0);
      console.log("PostgreSQL: migrations, insert, FK, deletion guard and rollback passed.");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  } finally { await pool.end(); }
}
main().catch(() => {
  console.error("PostgreSQL integration failed; verify the disposable TEST_DATABASE_URL.");
  process.exitCode = 1;
});
