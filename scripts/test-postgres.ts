import "dotenv/config";
import assert from "node:assert/strict";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createConnection } from "../src/db/connection";
import { platformPublishAttempt, publishBatch } from "../src/db/publishing-schema";
import { bossFromEnv, PgBossPublishingQueue, prepareQueues, type QueueTransaction } from "../src/infrastructure/jobs/publishing";
import { PublishingService } from "../src/modules/publishing/service";
import { registerPublishingWorkers } from "../src/worker/publishing-worker";
import { eq } from "drizzle-orm";
import { Readable } from "node:stream";

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
      await client.query("INSERT INTO connected_accounts (user_id, platform, remote_account_id, status) VALUES ($1, 'youtube', 'test-channel', 'connected')", [user.rows[0].id]);
      await client.query("SAVEPOINT cardinality");
      await assert.rejects(client.query("INSERT INTO connected_accounts (user_id, platform, remote_account_id, status) VALUES ($1, 'youtube', 'another', 'connected')", [user.rows[0].id]),
        (error: unknown) => (error as { code: string }).code === "23505");
      await client.query("ROLLBACK TO SAVEPOINT cardinality");
      const other = await client.query("INSERT INTO postonce_users DEFAULT VALUES RETURNING id");
      const otherConnection = await client.query("INSERT INTO connected_accounts (user_id, platform, remote_account_id, status) VALUES ($1, 'youtube', 'other-owner', 'connected') RETURNING id", [other.rows[0].id]);
      await client.query("SAVEPOINT binding_owner");
      await assert.rejects(client.query("INSERT INTO draft_connection_bindings (draft_id, user_id, platform, connection_id, confirmed_revision) VALUES ($1, $2, 'youtube', $3, 1)",
        [draft.rows[0].id, other.rows[0].id, otherConnection.rows[0].id]),
      (error: unknown) => (error as { code: string }).code === "23503");
      await client.query("ROLLBACK TO SAVEPOINT binding_owner");
      await client.query("ROLLBACK");
      const rolledBack = await client.query("SELECT id FROM drafts WHERE id=$1", [draft.rows[0].id]);
      assert.equal(rolledBack.rowCount, 0);
      const queueBoss = bossFromEnv(process.env, true);
      queueBoss.on("error", () => {});
      try {
        await queueBoss.start();
        await prepareQueues(queueBoss);
        const queue = new PgBossPublishingQueue(queueBoss);
        const owner = (await db.insert((await import("../src/db/schema")).postonceUsers).values({}).returning())[0];
        const durableDraft = (await db.insert((await import("../src/db/schema")).drafts).values({ userId: owner.id, caption: "durable" }).returning())[0];
        const created = await db.transaction(async tx => {
          const [batch] = await tx.insert(publishBatch).values({ userId: owner.id, draftId: durableDraft.id, draftVersion: durableDraft.version }).returning();
          const [attempt] = await tx.insert(platformPublishAttempt).values({ batchId: batch.id, platform: "instagram" }).returning();
          await queue.enqueueAttempt(tx as unknown as QueueTransaction, attempt.id);
          return attempt;
        });
        const resolver = async () => ({ adapter: { platform: "instagram" as const,
          publish: async (_input: unknown, events: { creation(id:string,stage:string):Promise<void> }) => { await events.creation("remote-container", "created"); return { status: "Published" as const, remoteId: "remote-post" }; },
          reconcile: async () => ({ status: "Published" as const, remoteId: "remote-post" }) },
          input: { token: "test", remoteAccountId: "test", caption: "", config: { platform: "instagram" as const, enabled: true },
            video: { size: 1, mime: "video/mp4", stream: async () => Readable.from("x"), url: async () => "https://media.test/x" } } });
        const publishing = new PublishingService(db, queue, resolver);
        await registerPublishingWorkers(queueBoss, publishing);
        let consumed = false;
        for (let i = 0; i < 80; i++) {
          const [attempt] = await db.select().from(platformPublishAttempt).where(eq(platformPublishAttempt.id, created.id));
          if (attempt.status === "Published") { consumed = true; assert.equal(attempt.remoteCreationId, "remote-container"); assert.equal(attempt.remoteId, "remote-post"); break; }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        assert.equal(consumed, true, "pg-boss worker did not consume the durable publication job");
      } finally { await queueBoss.stop({ graceful: true }); }
      console.log("PostgreSQL: migrations, constraints, rollback and pg-boss durable worker consumption passed.");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  } finally { await pool.end(); }
}
main().catch((error) => {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) :
    typeof error === "object" && error && "cause" in error && typeof error.cause === "object" && error.cause && "code" in error.cause ? String(error.cause.code) : "unknown";
  const detail = typeof error === "object" && error && "cause" in error && error.cause instanceof Error ? error.cause.message : error instanceof Error ? error.message.split("\n")[0] : "unknown";
  console.error(`PostgreSQL integration failed (${code}: ${detail}); verify migrations and the disposable database.`);
  process.exitCode = 1;
});
