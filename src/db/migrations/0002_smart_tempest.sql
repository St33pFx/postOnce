-- Referenced uniqueness must exist before adding the composite ownership FK.
ALTER TABLE "drafts" ADD CONSTRAINT "draft_owner_identity" UNIQUE("id","user_id");
--> statement-breakpoint
ALTER TABLE "draft_connection_bindings" ADD CONSTRAINT "draft_connection_bindings_draft_id_user_id_drafts_id_user_id_fk" FOREIGN KEY ("draft_id","user_id") REFERENCES "public"."drafts"("id","user_id") ON DELETE no action ON UPDATE no action;
