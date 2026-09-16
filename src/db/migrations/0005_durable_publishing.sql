CREATE TYPE "public"."publish_status" AS ENUM('Pending', 'Publishing', 'Published', 'Failed', 'UnknownOutcome', 'PublishedWithWarning');--> statement-breakpoint
CREATE TABLE "platform_publish_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"status" "publish_status" DEFAULT 'Pending' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"remote_creation_id" text,
	"remote_id" text,
	"progress" integer,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_started_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_publish_attempts_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "publish_attempt_platform_unique" UNIQUE("batch_id","platform","attempt_number"),
	CONSTRAINT "publish_attempt_platform" CHECK ("platform_publish_attempts"."platform" IN ('instagram','tiktok','youtube')),
	CONSTRAINT "publish_attempt_progress" CHECK ("platform_publish_attempts"."progress" IS NULL OR ("platform_publish_attempts"."progress" >= 0 AND "platform_publish_attempts"."progress" <= 100))
);
--> statement-breakpoint
CREATE TABLE "publish_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"draft_id" uuid NOT NULL,
	"draft_version" integer NOT NULL,
	"status" "publish_status" DEFAULT 'Pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secondary_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" "publish_status" DEFAULT 'Pending' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"remote_id" text,
	"error_code" text,
	"error_message" text,
	"request_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "secondary_operations_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "secondary_operation_attempt_unique" UNIQUE("attempt_id","kind","attempt_number"),
	CONSTRAINT "secondary_operation_kind" CHECK ("secondary_operations"."kind" IN ('youtube_thumbnail'))
);
--> statement-breakpoint
ALTER TABLE "platform_publish_attempts" ADD CONSTRAINT "platform_publish_attempts_batch_id_publish_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."publish_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_batches" ADD CONSTRAINT "publish_batches_user_id_postonce_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."postonce_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_batches" ADD CONSTRAINT "publish_batches_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_batches" ADD CONSTRAINT "publish_batches_draft_id_user_id_drafts_id_user_id_fk" FOREIGN KEY ("draft_id","user_id") REFERENCES "public"."drafts"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secondary_operations" ADD CONSTRAINT "secondary_operations_attempt_id_platform_publish_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."platform_publish_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publish_attempt_batch_idx" ON "platform_publish_attempts" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "publish_batches_user_idx" ON "publish_batches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "publish_batches_draft_idx" ON "publish_batches" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_publish_batch_per_user" ON "publish_batches" USING btree ("user_id") WHERE "publish_batches"."status" IN ('Pending', 'Publishing');--> statement-breakpoint
CREATE INDEX "secondary_attempt_idx" ON "secondary_operations" USING btree ("attempt_id");