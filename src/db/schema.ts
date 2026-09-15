import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Identity anchor; Better Auth's schema is intentionally added in Phase 2. */
export const postonceUsers = pgTable("postonce_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  // No deletion workflow yet. Fail closed rather than implicitly deleting drafts.
  userId: uuid("user_id").notNull().references(() => postonceUsers.id),
  caption: text("caption"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("drafts_user_id_idx").on(table.userId)]);
