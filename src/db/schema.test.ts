import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { drafts, postonceUsers } from "./schema";

const client = new PGlite();
const db = drizzle(client);

beforeAll(async () => { await migrate(db, { migrationsFolder: "src/db/migrations" }); });
afterAll(async () => { await client.close(); });

describe("versioned migration on embedded PostgreSQL", () => {
  it("can reapply the migration runner without recreating tables", async () => {
    await expect(migrate(db, { migrationsFolder: "src/db/migrations" })).resolves.toBeUndefined();
  });
  it("persists user-owned drafts with generated IDs and timestamps", async () => {
    const [user] = await db.insert(postonceUsers).values({}).returning();
    const [draft] = await db.insert(drafts).values({ userId: user.id, caption: "Hola 🌎" }).returning();
    expect(draft.userId).toBe(user.id);
    expect(draft.caption).toBe("Hola 🌎");
    expect(draft.createdAt).toBeInstanceOf(Date);
    expect(draft.id).not.toBe(user.id);
  });
  it("rejects orphan drafts", async () => {
    await expect(db.insert(drafts).values({ userId: crypto.randomUUID() })).rejects.toThrow();
  });
  it("requires an owner and blocks implicit cascade deletion", async () => {
    await expect(client.query("INSERT INTO drafts DEFAULT VALUES")).rejects.toThrow();
    await expect(client.query("DELETE FROM postonce_users")).rejects.toThrow();
  });
  it("rolls back a failed transaction without leaving its draft", async () => {
    const id = crypto.randomUUID();
    await expect(db.transaction(async (tx) => {
      const [user] = await tx.insert(postonceUsers).values({}).returning();
      await tx.insert(drafts).values({ id, userId: user.id });
      throw new Error("abort");
    })).rejects.toThrow("abort");
    const rows = await client.query("SELECT id FROM drafts WHERE id = $1", [id]);
    expect(rows.rows).toHaveLength(0);
  });
});
