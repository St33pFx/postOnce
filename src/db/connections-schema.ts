import { sql } from "drizzle-orm";
import { boolean, foreignKey, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { drafts, postonceUsers } from "./schema";

export const platformEnum = pgEnum("connection_platform", ["instagram", "tiktok", "youtube"]);
export const connectionStatus = pgEnum("connection_status", ["disconnected", "connected", "requires_reconnection", "ineligible"]);
export const connections = pgTable("connected_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => postonceUsers.id),
  platform: platformEnum("platform").notNull(),
  remoteAccountId: text("remote_account_id").notNull(),
  displayName: text("display_name"),
  status: connectionStatus("status").notNull(),
  active: boolean("active").notNull().default(true),
  revision: integer("revision").notNull().default(1),
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  tokenEnvelope: text("token_envelope"),
  // Only safe metadata: no arbitrary provider responses or token-bearing objects.
  metadata: jsonb("metadata").$type<{ eligibilityReason?: string }>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("one_active_account_per_user_platform").on(t.userId, t.platform).where(sql`${t.active} = true`),
  unique("connection_owner_platform_identity").on(t.id, t.userId, t.platform),
]);

/** Binding/invalidation metadata only; not a Phase 3 draft editor. */
export const draftConnections = pgTable("draft_connection_bindings", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id").notNull().references(() => drafts.id),
  userId: uuid("user_id").notNull().references(() => postonceUsers.id),
  platform: platformEnum("platform").notNull(),
  connectionId: uuid("connection_id").notNull(),
  confirmedRevision: integer("confirmed_revision").notNull(),
  requiresRevalidation: boolean("requires_revalidation").notNull().default(true),
  requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
}, (t) => [
  unique("draft_platform_binding").on(t.draftId, t.platform),
  foreignKey({ columns: [t.connectionId, t.userId, t.platform],
    foreignColumns: [connections.id, connections.userId, connections.platform] }),
  foreignKey({ columns: [t.draftId, t.userId], foreignColumns: [drafts.id, drafts.userId] }),
]);
