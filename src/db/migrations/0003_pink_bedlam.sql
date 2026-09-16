CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"status" text NOT NULL,
	"size" bigint NOT NULL,
	"reserved_bytes" bigint NOT NULL,
	"mime" text,
	"checksum" text,
	"metadata" jsonb,
	"upload_id" text,
	"part_size" integer NOT NULL,
	"parts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipe" jsonb,
	"error" text,
	"lease_until" timestamp with time zone,
	"operation_id" uuid,
	"retention" text DEFAULT 'draft_until_deleted' NOT NULL,
	"delete_after" timestamp with time zone,
	"upload_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "media_nonnegative_bytes" CHECK ("media_assets"."size" >= 0 AND "media_assets"."reserved_bytes" >= 0),
	CONSTRAINT "media_kind" CHECK ("media_assets"."kind" IN ('original_video','uploaded_image','extracted_frame','rendered_cover','thumbnail')),
	CONSTRAINT "media_status" CHECK ("media_assets"."status" IN ('initiating','uploading','uploaded','processing','ready','failed','abandoned','deleting','deleted'))
);
--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "video_id" uuid;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "cover" jsonb;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_draft_id_user_id_drafts_id_user_id_fk" FOREIGN KEY ("draft_id","user_id") REFERENCES "public"."drafts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_owner_draft_idx" ON "media_assets" USING btree ("user_id","draft_id");