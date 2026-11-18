CREATE TYPE "public"."assignment_source" AS ENUM('generated', 'manual', 'imported');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('pending', 'confirmed', 'declined', 'swapped');--> statement-breakpoint
CREATE TYPE "public"."availability_mode" AS ENUM('specific', 'flexible', 'ask_monthly');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."margins" AS ENUM('normal', 'narrow');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('weekend_group', 'monthly_preview', 'pair_reminder', 'swap_offer');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('sent', 'change_requested');--> statement-breakpoint
CREATE TYPE "public"."orientation" AS ENUM('landscape', 'portrait');--> statement-breakpoint
CREATE TYPE "public"."pair_rule" AS ENUM('never', 'prefer');--> statement-breakpoint
CREATE TYPE "public"."privilege" AS ENUM('publisher', 'auxiliary_pioneer', 'regular_pioneer');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."special_day_action" AS ENUM('off_before_cutoff_shift_overlap', 'shift_all_to_cutoff', 'cancel_matching_slots', 'cancel', 'change_time', 'add_session');--> statement-breakpoint
CREATE TYPE "public"."special_day_kind" AS ENUM('recurring', 'one_off');--> statement-breakpoint
CREATE TYPE "public"."swap_status" AS ENUM('open', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."title" AS ENUM('Bro', 'Sis');--> statement-breakpoint
CREATE TYPE "public"."weekday" AS ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"member_ids" uuid[] NOT NULL,
	"couple_id" uuid,
	"locked" boolean DEFAULT false NOT NULL,
	"allow_mixed" boolean DEFAULT false NOT NULL,
	"source" "assignment_source" DEFAULT 'generated' NOT NULL,
	"status" "assignment_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignments_two_people" CHECK (cardinality("assignments"."member_ids") between 1 and 2)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "couples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_a_id" uuid NOT NULL,
	"member_b_id" uuid NOT NULL,
	"display_label" text NOT NULL,
	"always_together" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "couples_sorted" CHECK ("couples"."member_a_id" < "couples"."member_b_id")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_filename" text NOT NULL,
	"month" varchar(7),
	"raw" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"message_name" text NOT NULL,
	"pdf_title" text NOT NULL,
	"pdf_color" varchar(9) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "member_availability" (
	"member_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_month_confirmations" (
	"member_id" uuid NOT NULL,
	"month" varchar(7) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_unavailable_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_unavailable_range" CHECK ("member_unavailable_dates"."end_date" >= "member_unavailable_dates"."start_date")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" "title" NOT NULL,
	"title_confirmed" boolean DEFAULT false NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"display_name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"gender" "gender" NOT NULL,
	"phone_e164" varchar(20),
	"privilege" "privilege" DEFAULT 'publisher' NOT NULL,
	"max_sessions_override" integer,
	"availability_mode" "availability_mode" DEFAULT 'flexible' NOT NULL,
	"preferred_location_id" uuid,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"paused_until" date,
	"public_token_hash" varchar(64),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_public_token_hash_unique" UNIQUE("public_token_hash"),
	CONSTRAINT "members_max_override_positive" CHECK ("members"."max_sessions_override" is null or "members"."max_sessions_override" >= 0)
);
--> statement-breakpoint
CREATE TABLE "message_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "message_kind" NOT NULL,
	"member_id" uuid,
	"schedule_id" uuid,
	"week_start" date,
	"rendered_text" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "message_status" DEFAULT 'sent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "message_kind" NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_kind_unique" UNIQUE("kind")
);
--> statement-breakpoint
CREATE TABLE "pair_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_a_id" uuid NOT NULL,
	"member_b_id" uuid NOT NULL,
	"rule" "pair_rule" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pair_rules_sorted" CHECK ("pair_rules"."member_a_id" < "pair_rules"."member_b_id")
);
--> statement-breakpoint
CREATE TABLE "print_layouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"column_widths" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_heights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cell_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"orientation" "orientation" DEFAULT 'landscape' NOT NULL,
	"margins" "margins" DEFAULT 'normal' NOT NULL,
	"fit_to_width" boolean DEFAULT true NOT NULL,
	"font_size" integer DEFAULT 11 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "print_layouts_schedule_id_unique" UNIQUE("schedule_id")
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" varchar(7) NOT NULL,
	"status" "schedule_status" DEFAULT 'draft' NOT NULL,
	"generated_seed" integer,
	"generated_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedules_month_unique" UNIQUE("month")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_id" uuid NOT NULL,
	"slot_id" uuid,
	"location_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"week_index" integer NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"special_day_rule_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"congregation_name" text DEFAULT 'Westlands English Congregation' NOT NULL,
	"timezone" text DEFAULT 'Africa/Accra' NOT NULL,
	"repeat_window_months" integer DEFAULT 3 NOT NULL,
	"privilege_limits" jsonb DEFAULT '{"publisher":2,"auxiliary_pioneer":4,"regular_pioneer":6}'::jsonb NOT NULL,
	"week_rule" text DEFAULT 'calendar_week' NOT NULL,
	"include_fifth_week" boolean DEFAULT true NOT NULL,
	"pairing_rule" text DEFAULT 'same_gender_or_couple' NOT NULL,
	"scoring_weights" jsonb,
	"print_defaults" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"key" varchar(60) NOT NULL,
	"weekday" "weekday" NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"people_needed" integer DEFAULT 2 NOT NULL,
	"pdf_day_label" text NOT NULL,
	"pdf_time_label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slots_ends_after_start" CHECK ("slots"."end_time" > "slots"."start_time")
);
--> statement-breakpoint
CREATE TABLE "special_day_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "special_day_kind" NOT NULL,
	"recurrence" jsonb,
	"date" date,
	"end_date" date,
	"location_ids" uuid[],
	"slot_ids" uuid[],
	"action" "special_day_action" NOT NULL,
	"cutoff_time" time,
	"new_start_time" time,
	"new_end_time" time,
	"note_for_messages" text,
	"note_for_pdf" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "swap_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"reason" text,
	"status" "swap_status" DEFAULT 'open' NOT NULL,
	"suggested_member_ids" uuid[],
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'editor' NOT NULL,
	"invited_by" uuid,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_couple_id_couples_id_fk" FOREIGN KEY ("couple_id") REFERENCES "public"."couples"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couples" ADD CONSTRAINT "couples_member_a_id_members_id_fk" FOREIGN KEY ("member_a_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "couples" ADD CONSTRAINT "couples_member_b_id_members_id_fk" FOREIGN KEY ("member_b_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_availability" ADD CONSTRAINT "member_availability_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_availability" ADD CONSTRAINT "member_availability_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_month_confirmations" ADD CONSTRAINT "member_month_confirmations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_unavailable_dates" ADD CONSTRAINT "member_unavailable_dates_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_preferred_location_id_locations_id_fk" FOREIGN KEY ("preferred_location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_log" ADD CONSTRAINT "message_log_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_rules" ADD CONSTRAINT "pair_rules_member_a_id_members_id_fk" FOREIGN KEY ("member_a_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pair_rules" ADD CONSTRAINT "pair_rules_member_b_id_members_id_fk" FOREIGN KEY ("member_b_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_layouts" ADD CONSTRAINT "print_layouts_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_slot_id_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_special_day_rule_id_special_day_rules_id_fk" FOREIGN KEY ("special_day_rule_id") REFERENCES "public"."special_day_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_session_idx" ON "assignments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "assignments_members_gin" ON "assignments" USING gin ("member_ids");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "couples_pair_idx" ON "couples" USING btree ("member_a_id","member_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_availability_idx" ON "member_availability" USING btree ("member_id","slot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_month_confirmations_idx" ON "member_month_confirmations" USING btree ("member_id","month");--> statement-breakpoint
CREATE INDEX "member_unavailable_member_idx" ON "member_unavailable_dates" USING btree ("member_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "members_display_name_idx" ON "members" USING btree (lower("display_name"));--> statement-breakpoint
CREATE INDEX "message_log_schedule_member_idx" ON "message_log" USING btree ("schedule_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pair_rules_pair_idx" ON "pair_rules" USING btree ("member_a_id","member_b_id");--> statement-breakpoint
CREATE INDEX "sessions_schedule_date_idx" ON "sessions" USING btree ("schedule_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_slot_date_idx" ON "sessions" USING btree ("slot_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "slots_location_key_idx" ON "slots" USING btree ("location_id","key");--> statement-breakpoint
CREATE INDEX "swap_requests_status_idx" ON "swap_requests" USING btree ("status");--> statement-breakpoint
CREATE VIEW "public"."pair_history" AS (
  select
    least(a.member_ids[1], a.member_ids[2]) as member_lo,
    greatest(a.member_ids[1], a.member_ids[2]) as member_hi,
    sc.month,
    s.date,
    s.slot_id,
    (a.couple_id is not null) as is_couple
  from assignments a
  join sessions s on s.id = a.session_id
  join schedules sc on sc.id = s.schedule_id
  where cardinality(a.member_ids) = 2
    and not s.is_cancelled
    and (sc.status in ('published', 'archived') or a.source = 'imported')
);