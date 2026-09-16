import { bigint, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { drafts } from "./schema";
import type { MediaMetadata, Recipe } from "../modules/media/model";
export const media = pgTable("media_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(), draftId: uuid("draft_id").notNull(),
  kind: text("kind").$type<"original_video" | "uploaded_image" | "extracted_frame" | "rendered_cover" | "thumbnail">().notNull(),
  objectKey: text("object_key").notNull().unique(),
  status: text("status").$type<"initiating" | "uploading" | "uploaded" | "processing" | "ready" | "failed" | "abandoned" | "deleting" | "deleted">().notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  reservedBytes: bigint("reserved_bytes", { mode: "number" }).notNull(),
  mime: text("mime"), checksum: text("checksum"), metadata: jsonb("metadata").$type<MediaMetadata>(),
  uploadId: text("upload_id"), partSize: integer("part_size").notNull(),
  parts: jsonb("parts").$type<Record<string, { checksum: string; etag?: string }>>().notNull().default({}),
  recipe: jsonb("recipe").$type<Recipe>(),
  error: text("error"), leaseUntil: timestamp("lease_until", { withTimezone: true }),
  operationId: uuid("operation_id"),
  retention: text("retention").notNull().default("draft_until_deleted"),
  deleteAfter: timestamp("delete_after", { withTimezone: true }),
  uploadExpiresAt: timestamp("upload_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [foreignKey({ columns: [t.draftId, t.userId], foreignColumns: [drafts.id, drafts.userId] }),
  index("media_owner_draft_idx").on(t.userId, t.draftId),
  check("media_nonnegative_bytes", sql`${t.size} >= 0 AND ${t.reservedBytes} >= 0`),
  check("media_kind", sql`${t.kind} IN ('original_video','uploaded_image','extracted_frame','rendered_cover','thumbnail')`),
  check("media_status", sql`${t.status} IN ('initiating','uploading','uploaded','processing','ready','failed','abandoned','deleting','deleted')`)]);
