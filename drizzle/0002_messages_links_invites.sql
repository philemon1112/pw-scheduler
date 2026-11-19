ALTER TABLE "assignments" ADD COLUMN "confirmed_member_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "public_token_enc" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "message_location_order" uuid[];--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invite_token_hash_unique" UNIQUE("invite_token_hash");