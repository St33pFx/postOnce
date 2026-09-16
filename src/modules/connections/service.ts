import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { connections, draftConnections } from "../../db/connections-schema";
import { drafts, postonceUsers } from "../../db/schema";
import type { Platform } from "../platforms/domain";
import { TokenVault, type Tokens } from "./vault";

type DB = NodePgDatabase<typeof import("../../db/schema")>;
export type VerifiedGrant = {
  platform: Platform; remoteAccountId: string; displayName?: string;
  scopes: string[]; expiresAt?: Date; eligible: boolean; tokens: Tokens;
};

/** Implementations must validate OAuth state, issuer, redirect, consent and scopes
 * before returning a grant. No concrete platform adapter is registered yet. */
export interface ConnectionAdapter {
  readonly platform: Platform;
  authorize(input: { state: string; challenge: string; redirectUri: string }): Promise<URL>;
  exchange(input: { code: string; verifier: string; redirectUri: string }): Promise<VerifiedGrant>;
  revoke(tokens: Tokens): Promise<void>;
}

const safeColumns = {
  id: connections.id, platform: connections.platform, remoteAccountId: connections.remoteAccountId,
  displayName: connections.displayName, status: connections.status, revision: connections.revision,
  scopes: connections.scopes, expiresAt: connections.expiresAt,
};

export class ConnectionService {
  constructor(private db: DB, private vault: TokenVault) {}

  async list(userId: string) {
    const rows = await this.db.select(safeColumns).from(connections)
      .where(and(eq(connections.userId, userId), eq(connections.active, true)));
    return rows.map((row) => ({ ...row, status: row.status === "connected" && row.expiresAt &&
      row.expiresAt <= new Date() ? "requires_reconnection" as const : row.status }));
  }

  /** Server-internal, never a browser-supplied grant. Serializes the user's slot updates. */
  async acceptGrant(userId: string, grant: VerifiedGrant) {
    if (!grant.remoteAccountId || !grant.tokens.accessToken) throw new Error("Invalid verified grant");
    return this.db.transaction(async (tx) => {
      const [owner] = await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      if (!owner) throw new Error("Resource unavailable");
      const [previous] = await tx.select().from(connections).where(and(eq(connections.userId, userId),
        eq(connections.platform, grant.platform), eq(connections.active, true)));
      const values = {
        displayName: grant.displayName ?? null, scopes: [...new Set(grant.scopes)],
        expiresAt: grant.expiresAt ?? null, updatedAt: new Date(),
        status: !grant.eligible ? "ineligible" as const : grant.expiresAt && grant.expiresAt <= new Date()
          ? "requires_reconnection" as const : "connected" as const,
        tokenEnvelope: this.vault.encrypt(grant.tokens, { userId, platform: grant.platform, remoteAccountId: grant.remoteAccountId }),
      };
      let id: string;
      if (previous?.remoteAccountId === grant.remoteAccountId) {
        id = previous.id;
        await tx.update(connections).set({ ...values, revision: previous.revision + 1 }).where(eq(connections.id, id));
      } else {
        if (previous) await tx.update(connections).set({ active: false, status: "disconnected", tokenEnvelope: null,
          updatedAt: new Date() }).where(eq(connections.id, previous.id));
        const [created] = await tx.insert(connections).values({ userId, platform: grant.platform,
          remoteAccountId: grant.remoteAccountId, ...values }).returning({ id: connections.id });
        id = created.id;
      }
      // Keep the old identity reference. Never silently retarget prepared content.
      await tx.update(draftConnections).set({ requiresRevalidation: true,
        requiresConfirmation: sql`${draftConnections.requiresConfirmation} OR ${draftConnections.connectionId} <> ${id}::uuid` })
        .where(and(eq(draftConnections.userId, userId), eq(draftConnections.platform, grant.platform)));
      return id;
    });
  }

  async disconnect(userId: string, id: string) {
    return this.db.transaction(async (tx) => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const changed = await tx.update(connections).set({ status: "disconnected", tokenEnvelope: null,
        revision: sql`${connections.revision} + 1`, updatedAt: new Date() })
        .where(and(eq(connections.id, id), eq(connections.userId, userId), eq(connections.active, true)))
        .returning({ platform: connections.platform });
      if (!changed.length) throw new Error("Resource unavailable");
      await tx.update(draftConnections).set({ requiresRevalidation: true }).where(and(
        eq(draftConnections.userId, userId), eq(draftConnections.platform, changed[0].platform)));
    });
  }

  async markRequiresReconnection(userId: string, id: string) {
    await this.db.transaction(async (tx) => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const rows = await tx.update(connections).set({ status: "requires_reconnection", updatedAt: new Date(),
        revision: sql`${connections.revision} + 1` })
        .where(and(eq(connections.id, id), eq(connections.userId, userId), eq(connections.active, true)))
        .returning({ id: connections.id });
      if (!rows.length) throw new Error("Resource unavailable");
      await tx.update(draftConnections).set({ requiresRevalidation: true })
        .where(and(eq(draftConnections.userId, userId), eq(draftConnections.connectionId, id)));
    });
  }

  async readTokens(userId: string, id: string) {
    const [row] = await this.db.select().from(connections).where(and(eq(connections.id, id),
      eq(connections.userId, userId), eq(connections.active, true)));
    if (!row?.tokenEnvelope || row.status !== "connected" || (row.expiresAt && row.expiresAt <= new Date())) {
      throw new Error("Resource unavailable");
    }
    return this.vault.decrypt(row.tokenEnvelope, row);
  }

  /** Explicitly validates the selected binding against the current connection revision. */
  async confirmBinding(userId: string, draftId: string, platform: Platform, id: string, revision: number) {
    await this.db.transaction(async (tx) => {
      await tx.select().from(postonceUsers).where(eq(postonceUsers.id, userId)).for("update");
      const [draft] = await tx.select().from(drafts).where(and(eq(drafts.id, draftId), eq(drafts.userId, userId)));
      const [connection] = await tx.select().from(connections).where(and(eq(connections.id, id),
        eq(connections.userId, userId), eq(connections.platform, platform), eq(connections.active, true),
        eq(connections.revision, revision), eq(connections.status, "connected")));
      if (!draft || !connection || (connection.expiresAt && connection.expiresAt <= new Date())) throw new Error("Resource unavailable");
      await tx.insert(draftConnections).values({ draftId, userId, platform, connectionId: id,
        confirmedRevision: revision, requiresRevalidation: false, requiresConfirmation: false })
        .onConflictDoUpdate({ target: [draftConnections.draftId, draftConnections.platform],
          set: { connectionId: id, confirmedRevision: revision, requiresRevalidation: false, requiresConfirmation: false } });
    });
  }
}
