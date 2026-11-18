import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  pgView,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * The whole data model (§5 of the build prompt).
 *
 * Conventions, applied to every table:
 * - `uuid` primary keys from `gen_random_uuid()` (built into Postgres 13+).
 * - `created_at` / `updated_at`; `updated_at` is set by the app on write.
 * - Members and locations are never hard-deleted — `archived_at` keeps their
 *   history readable.
 * - Times are `time` columns and dates `date` columns, both meaning Accra
 *   local time. Ghana has no daylight saving, and storing wall-clock values
 *   is what a rota is: "Friday 06:00" never means a different hour.
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/* ── Enums ──────────────────────────────────────────────────────────────── */

export const roleEnum = pgEnum("role", ["owner", "editor", "viewer"]);
export const titleEnum = pgEnum("title", ["Bro", "Sis"]);
export const genderEnum = pgEnum("gender", ["M", "F"]);
export const privilegeEnum = pgEnum("privilege", ["publisher", "auxiliary_pioneer", "regular_pioneer"]);
export const availabilityModeEnum = pgEnum("availability_mode", ["specific", "flexible", "ask_monthly"]);
export const weekdayEnum = pgEnum("weekday", ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export const pairRuleEnum = pgEnum("pair_rule", ["never", "prefer"]);
export const scheduleStatusEnum = pgEnum("schedule_status", ["draft", "published", "archived"]);
export const assignmentSourceEnum = pgEnum("assignment_source", ["generated", "manual", "imported"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["pending", "confirmed", "declined", "swapped"]);
export const swapStatusEnum = pgEnum("swap_status", ["open", "approved", "rejected", "withdrawn"]);
export const specialDayKindEnum = pgEnum("special_day_kind", ["recurring", "one_off"]);
export const specialDayActionEnum = pgEnum("special_day_action", [
  // Recurring rules (§7).
  "off_before_cutoff_shift_overlap",
  "shift_all_to_cutoff",
  "cancel_matching_slots",
  // One-off days.
  "cancel",
  "change_time",
  "add_session",
]);
export const messageKindEnum = pgEnum("message_kind", ["weekend_group", "monthly_preview", "pair_reminder", "swap_offer"]);
export const messageStatusEnum = pgEnum("message_status", ["sent", "change_requested"]);
export const orientationEnum = pgEnum("orientation", ["landscape", "portrait"]);
export const marginsEnum = pgEnum("margins", ["normal", "narrow"]);

/* ── People with accounts ───────────────────────────────────────────────── */

export const users = pgTable("users", {
  id: id(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("editor"),
  invitedBy: uuid("invited_by"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...stamps,
});

/* ── Settings (one row) ─────────────────────────────────────────────────── */

export type WeekRule = "calendar_week" | "nth_weekday";
export type PrivilegeLimits = Record<"publisher" | "auxiliary_pioneer" | "regular_pioneer", number>;

export const settings = pgTable(
  "settings",
  {
    // Always 1: there is one congregation per deployment (§17), and a fixed
    // id makes "the settings row" a primary-key lookup.
    id: integer("id").primaryKey().default(1),
    congregationName: text("congregation_name").notNull().default("Westlands English Congregation"),
    timezone: text("timezone").notNull().default("Africa/Accra"),
    repeatWindowMonths: integer("repeat_window_months").notNull().default(3),
    privilegeLimits: jsonb("privilege_limits")
      .$type<PrivilegeLimits>()
      .notNull()
      .default({ publisher: 2, auxiliary_pioneer: 4, regular_pioneer: 6 }),
    weekRule: text("week_rule").$type<WeekRule>().notNull().default("calendar_week"),
    includeFifthWeek: boolean("include_fifth_week").notNull().default(true),
    pairingRule: text("pairing_rule").$type<"same_gender_or_couple">().notNull().default("same_gender_or_couple"),
    /** Scoring weights for the scheduler; null means the built-in defaults. */
    scoringWeights: jsonb("scoring_weights").$type<Record<string, number>>(),
    printDefaults: jsonb("print_defaults").$type<Record<string, unknown>>(),
    ...stamps,
  },
  (t) => [check("settings_single_row", sql`${t.id} = 1`)]
);

/* ── Locations and slots ────────────────────────────────────────────────── */

export const locations = pgTable(
  "locations",
  {
    id: id(),
    key: varchar("key", { length: 40 }).notNull().unique(),
    name: text("name").notNull(),
    messageName: text("message_name").notNull(),
    pdfTitle: text("pdf_title").notNull(),
    pdfColor: varchar("pdf_color", { length: 9 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...stamps,
  }
);

export const slots = pgTable(
  "slots",
  {
    id: id(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    key: varchar("key", { length: 60 }).notNull(),
    weekday: weekdayEnum("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    peopleNeeded: integer("people_needed").notNull().default(2),
    pdfDayLabel: text("pdf_day_label").notNull(),
    pdfTimeLabel: text("pdf_time_label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...stamps,
  },
  (t) => [
    uniqueIndex("slots_location_key_idx").on(t.locationId, t.key),
    check("slots_ends_after_start", sql`${t.endTime} > ${t.startTime}`),
  ]
);

/* ── Members ────────────────────────────────────────────────────────────── */

export const members = pgTable(
  "members",
  {
    id: id(),
    title: titleEnum("title").notNull(),
    titleConfirmed: boolean("title_confirmed").notNull().default(false),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** As written on the schedule: "Julia Eshun". */
    displayName: text("display_name").notNull(),
    /** Other spellings seen in old schedules, for matching on import. */
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    /** Taken from the title, kept as its own column for the pairing rule. */
    gender: genderEnum("gender").notNull(),
    /** Normalised to E.164 (`+233…`). */
    phoneE164: varchar("phone_e164", { length: 20 }),
    privilege: privilegeEnum("privilege").notNull().default("publisher"),
    maxSessionsOverride: integer("max_sessions_override"),
    availabilityMode: availabilityModeEnum("availability_mode").notNull().default("flexible"),
    preferredLocationId: uuid("preferred_location_id").references(() => locations.id),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    pausedUntil: date("paused_until"),
    /** SHA-256 of the member's private link token; the raw token is never stored. */
    publicTokenHash: varchar("public_token_hash", { length: 64 }).unique(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [
    uniqueIndex("members_display_name_idx").on(sql`lower(${t.displayName})`),
    check("members_max_override_positive", sql`${t.maxSessionsOverride} is null or ${t.maxSessionsOverride} >= 0`),
  ]
);

export const couples = pgTable(
  "couples",
  {
    id: id(),
    // Stored with `member_a_id < member_b_id`, so a couple can only exist once.
    memberAId: uuid("member_a_id")
      .notNull()
      .references(() => members.id),
    memberBId: uuid("member_b_id")
      .notNull()
      .references(() => members.id),
    displayLabel: text("display_label").notNull(),
    alwaysTogether: boolean("always_together").notNull().default(true),
    ...stamps,
  },
  (t) => [
    uniqueIndex("couples_pair_idx").on(t.memberAId, t.memberBId),
    check("couples_sorted", sql`${t.memberAId} < ${t.memberBId}`),
  ]
);

export const memberAvailability = pgTable(
  "member_availability",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    slotId: uuid("slot_id")
      .notNull()
      .references(() => slots.id, { onDelete: "cascade" }),
    ...stamps,
  },
  (t) => [uniqueIndex("member_availability_idx").on(t.memberId, t.slotId)]
);

/** "Available this month" for members in `ask_monthly` mode. */
export const memberMonthConfirmations = pgTable(
  "member_month_confirmations",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    ...stamps,
  },
  (t) => [uniqueIndex("member_month_confirmations_idx").on(t.memberId, t.month)]
);

export const memberUnavailableDates = pgTable(
  "member_unavailable_dates",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    ...stamps,
  },
  (t) => [
    index("member_unavailable_member_idx").on(t.memberId, t.startDate),
    check("member_unavailable_range", sql`${t.endDate} >= ${t.startDate}`),
  ]
);

export const pairRules = pgTable(
  "pair_rules",
  {
    id: id(),
    // Sorted like couples, so (A,B) and (B,A) are the same rule.
    memberAId: uuid("member_a_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    memberBId: uuid("member_b_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    rule: pairRuleEnum("rule").notNull(),
    ...stamps,
  },
  (t) => [
    uniqueIndex("pair_rules_pair_idx").on(t.memberAId, t.memberBId),
    check("pair_rules_sorted", sql`${t.memberAId} < ${t.memberBId}`),
  ]
);

/* ── Special days ───────────────────────────────────────────────────────── */

export type Recurrence = { type: "nth_weekday"; n: number; weekday: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" };

export const specialDayRules = pgTable("special_day_rules", {
  id: id(),
  name: text("name").notNull(),
  kind: specialDayKindEnum("kind").notNull(),
  recurrence: jsonb("recurrence").$type<Recurrence>(),
  /** One-off days: a single date, or a range with `end_date`. */
  date: date("date"),
  endDate: date("end_date"),
  /** Null means every location. */
  locationIds: uuid("location_ids").array(),
  /** One-off `cancel`: null means every slot at those locations. */
  slotIds: uuid("slot_ids").array(),
  action: specialDayActionEnum("action").notNull(),
  cutoffTime: time("cutoff_time"),
  newStartTime: time("new_start_time"),
  newEndTime: time("new_end_time"),
  noteForMessages: text("note_for_messages"),
  noteForPdf: text("note_for_pdf"),
  active: boolean("active").notNull().default(true),
  ...stamps,
});

/* ── Schedules ──────────────────────────────────────────────────────────── */

export const schedules = pgTable("schedules", {
  id: id(),
  month: varchar("month", { length: 7 }).notNull().unique(),
  status: scheduleStatusEnum("status").notNull().default("draft"),
  generatedSeed: integer("generated_seed"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  notes: text("notes"),
  ...stamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => schedules.id, { onDelete: "cascade" }),
    /** Null for a one-off extra session that belongs to no weekly slot. */
    slotId: uuid("slot_id").references(() => slots.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    date: date("date").notNull(),
    /** After special-day adjustments — never the slot's original time. */
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    weekIndex: integer("week_index").notNull(),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    specialDayRuleId: uuid("special_day_rule_id").references(() => specialDayRules.id),
    note: text("note"),
    ...stamps,
  },
  (t) => [
    index("sessions_schedule_date_idx").on(t.scheduleId, t.date),
    uniqueIndex("sessions_slot_date_idx").on(t.slotId, t.date),
  ]
);

export const assignments = pgTable(
  "assignments",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    memberIds: uuid("member_ids").array().notNull(),
    coupleId: uuid("couple_id").references(() => couples.id),
    locked: boolean("locked").notNull().default(false),
    /** Mixed pair allowed here even though the pairing rule says otherwise. */
    allowMixed: boolean("allow_mixed").notNull().default(false),
    source: assignmentSourceEnum("source").notNull().default("generated"),
    status: assignmentStatusEnum("status").notNull().default("pending"),
    /** The scheduler's one-line explanation: "not paired since Jul · 2 of 4 used". */
    reason: text("reason"),
    ...stamps,
  },
  (t) => [
    uniqueIndex("assignments_session_idx").on(t.sessionId),
    index("assignments_members_gin").using("gin", t.memberIds),
    check("assignments_two_people", sql`cardinality(${t.memberIds}) between 1 and 2`),
  ]
);

export const swapRequests = pgTable(
  "swap_requests",
  {
    id: id(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id),
    reason: text("reason"),
    status: swapStatusEnum("status").notNull().default("open"),
    suggestedMemberIds: uuid("suggested_member_ids").array(),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("swap_requests_status_idx").on(t.status)]
);

/* ── Messages ───────────────────────────────────────────────────────────── */

export const messageTemplates = pgTable("message_templates", {
  id: id(),
  kind: messageKindEnum("kind").notNull().unique(),
  body: text("body").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  ...stamps,
});

export const messageLog = pgTable(
  "message_log",
  {
    id: id(),
    kind: messageKindEnum("kind").notNull(),
    memberId: uuid("member_id").references(() => members.id),
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "cascade" }),
    weekStart: date("week_start"),
    renderedText: text("rendered_text").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    status: messageStatusEnum("status").notNull().default("sent"),
    ...stamps,
  },
  (t) => [index("message_log_schedule_member_idx").on(t.scheduleId, t.memberId)]
);

/* ── Print layout ───────────────────────────────────────────────────────── */

export const printLayouts = pgTable("print_layouts", {
  id: id(),
  scheduleId: uuid("schedule_id")
    .notNull()
    .unique()
    .references(() => schedules.id, { onDelete: "cascade" }),
  columnWidths: jsonb("column_widths").$type<Record<string, number>>().notNull().default({}),
  rowHeights: jsonb("row_heights").$type<Record<string, number>>().notNull().default({}),
  /** Text typed into the sheet editor; never changes the real assignments. */
  cellOverrides: jsonb("cell_overrides").$type<Record<string, string>>().notNull().default({}),
  orientation: orientationEnum("orientation").notNull().default("landscape"),
  margins: marginsEnum("margins").notNull().default("normal"),
  fitToWidth: boolean("fit_to_width").notNull().default(true),
  fontSize: integer("font_size").notNull().default(11),
  ...stamps,
});

/* ── Audit, imports, rate limits ────────────────────────────────────────── */

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    diff: jsonb("diff"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId)]
);

export const importBatches = pgTable("import_batches", {
  id: id(),
  sourceFilename: text("source_filename").notNull(),
  month: varchar("month", { length: 7 }),
  raw: jsonb("raw").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  ...stamps,
});

/**
 * Fixed-window counters for login and the public member routes. In Postgres
 * rather than memory, because a serverless instance's memory is not shared
 * with the next one and would limit nothing.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

/* ── Pair history (a view) ──────────────────────────────────────────────── */

/**
 * Every pair that has served together, from imported and published
 * schedules, with the two ids sorted so (A,B) and (B,A) are one pair. The
 * scheduler's no-repeat logic and the History screen both read this.
 */
export const pairHistory = pgView("pair_history", {
  memberLo: uuid("member_lo").notNull(),
  memberHi: uuid("member_hi").notNull(),
  month: varchar("month", { length: 7 }).notNull(),
  date: date("date").notNull(),
  slotId: uuid("slot_id"),
  isCouple: boolean("is_couple").notNull(),
}).as(sql`
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
`);
