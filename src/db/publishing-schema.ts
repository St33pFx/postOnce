import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { drafts, postonceUsers } from "./schema";

export const publishStatus = pgEnum("publish_status", ["Pending", "Publishing", "Published", "Failed", "UnknownOutcome", "PublishedWithWarning"]);
export type PublishMetadata = { stage?: string; providerStatus?: string; reconciliationNote?: string };

export const publishBatch = pgTable("publish_batches", {
  id: uuid("id").defaultRandom().primaryKey(), userId: uuid("user_id").notNull().references(() => postonceUsers.id),
  draftId: uuid("draft_id").notNull().references(() => drafts.id), draftVersion: integer("draft_version").notNull(),
  status: publishStatus("status").notNull().default("Pending"), completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [foreignKey({ columns: [t.draftId, t.userId], foreignColumns: [drafts.id, drafts.userId] }),
  index("publish_batches_user_idx").on(t.userId), index("publish_batches_draft_idx").on(t.draftId),
  uniqueIndex("one_active_publish_batch_per_user").on(t.userId).where(sql`${t.status} IN ('Pending', 'Publishing')`)]);

export const platformPublishAttempt = pgTable("platform_publish_attempts", {
  id: uuid("id").defaultRandom().primaryKey(), batchId: uuid("batch_id").notNull().references(() => publishBatch.id),
  platform: text("platform").$type<"instagram" | "tiktok" | "youtube">().notNull(), status: publishStatus("status").notNull().default("Pending"),
  attemptNumber: integer("attempt_number").notNull().default(1), idempotencyKey: uuid("idempotency_key").defaultRandom().notNull().unique(),
  remoteCreationId: text("remote_creation_id"), remoteId: text("remote_id"), progress: integer("progress"),
  errorCode: text("error_code"), errorMessage: text("error_message"), metadata: jsonb("metadata").$type<PublishMetadata>().notNull().default({}),
  requestStartedAt: timestamp("request_started_at", { withTimezone: true }), startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [unique("publish_attempt_platform_unique").on(t.batchId, t.platform, t.attemptNumber), index("publish_attempt_batch_idx").on(t.batchId),
  check("publish_attempt_platform", sql`${t.platform} IN ('instagram','tiktok','youtube')`),
  check("publish_attempt_progress", sql`${t.progress} IS NULL OR (${t.progress} >= 0 AND ${t.progress} <= 100)`)]);

export const secondaryOperation = pgTable("secondary_operations", {
  id: uuid("id").defaultRandom().primaryKey(), attemptId: uuid("attempt_id").notNull().references(() => platformPublishAttempt.id),
  kind: text("kind").$type<"youtube_thumbnail">().notNull(), status: publishStatus("status").notNull().default("Pending"),
  attemptNumber: integer("attempt_number").notNull().default(1), idempotencyKey: uuid("idempotency_key").defaultRandom().notNull().unique(),
  remoteId: text("remote_id"), errorCode: text("error_code"), errorMessage: text("error_message"),
  requestStartedAt: timestamp("request_started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, t => [unique("secondary_operation_attempt_unique").on(t.attemptId, t.kind, t.attemptNumber), index("secondary_attempt_idx").on(t.attemptId),
  check("secondary_operation_kind", sql`${t.kind} IN ('youtube_thumbnail')`)]);
