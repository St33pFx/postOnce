import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import type { CoverState } from "../modules/media/model";
import { user } from "./auth-schema";
export { user, session, account, verification } from "./auth-schema";

/** Identity anchor; Better Auth's schema is intentionally added in Phase 2. */
export const postonceUsers = pgTable("postonce_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: text("auth_user_id").unique().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  // No deletion workflow yet. Fail closed rather than implicitly deleting drafts.
  userId: uuid("user_id").notNull().references(() => postonceUsers.id),
  caption: text("caption"),
  version: integer("version").notNull().default(1),
  videoId: uuid("video_id"),
  cover: jsonb("cover").$type<CoverState>(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("drafts_user_id_idx").on(table.userId), unique("draft_owner_identity").on(table.id, table.userId)]);
