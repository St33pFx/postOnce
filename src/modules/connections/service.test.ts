import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "../../db/schema";
import { connections, draftConnections } from "../../db/connections-schema";
import { ConnectionService, type VerifiedGrant } from "./service";
import { TokenVault } from "./vault";

const pg = new PGlite();
const embedded = drizzle(pg, { schema });
const service = new ConnectionService(embedded as unknown as NodePgDatabase<typeof schema>, new TokenVault({ k1: randomBytes(32) }, "k1"));
const grant: VerifiedGrant = { platform: "youtube", remoteAccountId: "channel-a", displayName: "A",
  scopes: ["upload"], eligible: true, tokens: { accessToken: "plaintext-for-test-only" } };
let alice: string, bob: string, draftId: string;
beforeAll(async () => {
  await migrate(embedded, { migrationsFolder: "src/db/migrations" });
  const users = await embedded.insert(schema.postonceUsers).values([{}, {}]).returning();
  alice = users[0].id; bob = users[1].id;
  const [draft] = await embedded.insert(schema.drafts).values({ userId: alice }).returning(); draftId = draft.id;
});
afterAll(async () => pg.close());
describe("owner-scoped connection lifecycle", () => {
  it("stores encrypted grants and limits DB cardinality", async () => {
    const id = await service.acceptGrant(alice, grant);
    expect(await service.readTokens(alice, id)).toEqual(grant.tokens);
    const records = await embedded.select().from(connections);
    expect(JSON.stringify(records)).not.toContain(grant.tokens.accessToken);
    expect(JSON.stringify(await service.list(alice))).not.toContain("tokenEnvelope");
    await expect(embedded.insert(connections).values({ userId: alice, platform: "youtube", remoteAccountId: "duplicate", status: "connected" }))
      .rejects.toThrow();
    await service.acceptGrant(bob, { ...grant, remoteAccountId: "bob-channel" });
    expect((await service.list(bob))[0].remoteAccountId).toBe("bob-channel");
    await expect(service.readTokens(bob, id)).rejects.toThrow("Resource unavailable");
    await expect(service.disconnect(bob, id)).rejects.toThrow("Resource unavailable");
    await expect(service.confirmBinding(bob, draftId, "youtube", id, 1)).rejects.toThrow("Resource unavailable");
  });
  it("reconnects same identity but marks bindings for revalidation", async () => {
    const [before] = await service.list(alice);
    await service.confirmBinding(alice, draftId, "youtube", before.id, before.revision);
    expect(await service.acceptGrant(alice, grant)).toBe(before.id);
    const [after] = await service.list(alice);
    expect(after.revision).toBe(before.revision + 1);
    const [binding] = await embedded.select().from(draftConnections);
    expect(binding.requiresRevalidation).toBe(true);
    expect(binding.requiresConfirmation).toBe(false);
  });
  it("preserves old identity and requires confirmation on remote identity change", async () => {
    const [old] = await service.list(alice);
    const id = await service.acceptGrant(alice, { ...grant, remoteAccountId: "channel-new" });
    expect(id).not.toBe(old.id);
    const [binding] = await embedded.select().from(draftConnections);
    expect(binding.connectionId).toBe(old.id);
    expect(binding.requiresConfirmation).toBe(true);
    await expect(service.confirmBinding(alice, draftId, "youtube", old.id, old.revision)).rejects.toThrow();
    await service.confirmBinding(alice, draftId, "youtube", id, 1);
    const [confirmed] = await embedded.select().from(draftConnections);
    expect(confirmed.connectionId).toBe(id);
    expect(confirmed.requiresConfirmation).toBe(false);
    expect(confirmed.requiresRevalidation).toBe(true);
    const history = await embedded.select().from(connections);
    expect(history.find((row) => row.id === old.id)?.remoteAccountId).toBe("channel-a");
    expect(history.find((row) => row.id === old.id)?.tokenEnvelope).toBeNull();
  });
  it("disconnects without deleting history and rejects token reads", async () => {
    const [current] = await service.list(alice);
    await service.disconnect(alice, current.id);
    expect((await service.list(alice))[0].status).toBe("disconnected");
    await expect(service.readTokens(alice, current.id)).rejects.toThrow();
  });
  it("represents expiration and ineligibility without claiming readiness", async () => {
    const id = await service.acceptGrant(alice, { ...grant, expiresAt: new Date(0) });
    expect((await service.list(alice))[0].status).toBe("requires_reconnection");
    await expect(service.readTokens(alice, id)).rejects.toThrow();
    await service.acceptGrant(alice, { ...grant, eligible: false });
    expect((await service.list(alice))[0].status).toBe("ineligible");
  });
  it("enforces draft ownership in SQL, not only in service code", async () => {
    const [bobsConnection] = await service.list(bob);
    await expect(embedded.insert(draftConnections).values({ draftId, userId: bob, platform: "youtube",
      connectionId: bobsConnection.id, confirmedRevision: bobsConnection.revision })).rejects.toThrow();
  });
  it("detects revoked grants and preserves other users", async () => {
    const [bobsConnection] = await service.list(bob);
    await expect(service.markRequiresReconnection(alice, bobsConnection.id)).rejects.toThrow();
    expect((await service.list(bob))[0].status).toBe("connected");
    await service.markRequiresReconnection(bob, bobsConnection.id);
    expect((await service.list(bob))[0].status).toBe("requires_reconnection");
  });
});
