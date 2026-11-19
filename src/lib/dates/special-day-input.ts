import { z } from "zod";

import { WEEKDAYS, type Weekday } from "./calendar";
import { minutesOf } from "./time";

const Time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a time like 10:00.");
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const RECURRING = ["off_before_cutoff_shift_overlap", "shift_all_to_cutoff", "cancel_matching_slots"] as const;
const ONE_OFF = ["cancel", "change_time", "add_session"] as const;

/** What the special-day editor sends. Checked again on the server. */
export const SpecialDayInput = z
  .object({
    id: z.string().uuid().nullable(),
    name: z.string().trim().min(1, "Give the day a name.").max(80),
    kind: z.enum(["recurring", "one_off"]),
    recurrenceN: z.number().int().min(1).max(5),
    recurrenceWeekday: z.enum(WEEKDAYS as [Weekday, ...Weekday[]]),
    date: Day.nullable(),
    endDate: Day.nullable(),
    locationIds: z.array(z.string().uuid()).max(20),
    slotIds: z.array(z.string().uuid()).max(60),
    action: z.enum([...RECURRING, ...ONE_OFF]),
    cutoffTime: Time.nullable(),
    newStartTime: Time.nullable(),
    newEndTime: Time.nullable(),
    noteForMessages: z.string().trim().max(400),
    noteForPdf: z.string().trim().max(200),
    active: z.boolean(),
  })
  .superRefine((rule, ctx) => {
    const issue = (message: string, path: string) => ctx.addIssue({ code: "custom", message, path: [path] });
    if (rule.kind === "recurring") {
      if (!(RECURRING as readonly string[]).includes(rule.action)) issue("Pick what the day does.", "action");
      if (rule.action !== "cancel_matching_slots" && !rule.cutoffTime) issue("Set the time it ends.", "cutoffTime");
    } else {
      if (!(ONE_OFF as readonly string[]).includes(rule.action)) issue("Pick what the day does.", "action");
      if (!rule.date) issue("Pick the date.", "date");
      if (rule.date && rule.endDate && rule.endDate < rule.date) issue("The last day is before the first.", "endDate");
      if (rule.action === "change_time" || rule.action === "add_session") {
        if (!rule.newStartTime || !rule.newEndTime) issue("Set the new start and end times.", "newStartTime");
        else if (minutesOf(rule.newEndTime) <= minutesOf(rule.newStartTime)) issue("It has to end after it starts.", "newEndTime");
      }
      if (rule.action === "add_session" && rule.locationIds.length === 0) issue("Pick where the extra session is.", "locationIds");
    }
  });

export type SpecialDayInput = z.infer<typeof SpecialDayInput>;
