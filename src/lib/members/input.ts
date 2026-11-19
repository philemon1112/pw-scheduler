import { z } from "zod";

/**
 * What the member editor sends (§10.3). Shared by the form and the server
 * action, so the two can't disagree about what is valid — but the server
 * parses it again regardless, because a server action can be called directly.
 */
const Uuid = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "That date didn't look right.");

export const MemberInput = z
  .object({
    id: Uuid.nullable(),
    title: z.enum(["Bro", "Sis"]),
    titleConfirmed: z.boolean(),
    firstName: z.string().trim().min(1, "Enter a first name.").max(60),
    lastName: z.string().trim().max(80),
    displayName: z.string().trim().min(1, "Enter the name as it should appear on the schedule.").max(120),
    phone: z.string().trim().max(40),
    privilege: z.enum(["publisher", "auxiliary_pioneer", "regular_pioneer"]),
    maxSessionsOverride: z.number().int().min(0, "A limit can't be negative.").max(31).nullable(),
    availabilityMode: z.enum(["specific", "flexible", "ask_monthly"]),
    slotIds: z.array(Uuid).max(50),
    preferredLocationId: Uuid.nullable(),
    notes: z.string().trim().max(1000),
    active: z.boolean(),
    pausedUntil: Day.nullable(),
    partnerId: Uuid.nullable(),
    /** For a couple: only ever place them together. */
    alwaysTogether: z.boolean().default(false),
    neverIds: z.array(Uuid).max(60),
    unavailable: z
      .array(z.object({ start: Day, end: Day, reason: z.string().trim().max(120) }))
      .max(40)
      .refine((ranges) => ranges.every((range) => range.end >= range.start), "An away period ends before it starts."),
  })
  .refine((member) => member.availabilityMode !== "specific" || member.slotIds.length > 0, {
    message: "Tick at least one slot, or choose Flexible.",
    path: ["slotIds"],
  })
  .refine((member) => !member.partnerId || member.partnerId !== member.id, { message: "Someone can't be their own partner.", path: ["partnerId"] })
  .refine((member) => !member.id || !member.neverIds.includes(member.id), { message: "Someone can't be kept apart from themselves.", path: ["neverIds"] });

export type MemberInput = z.infer<typeof MemberInput>;

export const AVAILABILITY_LABELS = {
  specific: "Specific slots",
  flexible: "Flexible",
  ask_monthly: "Ask me monthly",
} as const;
