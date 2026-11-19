import type { Weekday } from "./calendar";

/**
 * Special days (§7): a date rule that turns slots off or moves their times.
 *
 * The shapes the date logic works on — plain data, no database types — so
 * the rule editor's live preview, the generator, the sheet and the messages
 * all run the same function on the same input.
 */

export type RecurringAction = "off_before_cutoff_shift_overlap" | "shift_all_to_cutoff" | "cancel_matching_slots";
export type OneOffAction = "cancel" | "change_time" | "add_session";
export type SpecialDayAction = RecurringAction | OneOffAction;

export interface SpecialDayRule {
  id: string;
  name: string;
  kind: "recurring" | "one_off";
  /** Recurring: the n-th weekday of every month. */
  recurrence: { type: "nth_weekday"; n: number; weekday: Weekday } | null;
  /** One-off: the first day, and the last when it spans several. */
  date: string | null;
  endDate: string | null;
  /** Null means every location. */
  locationIds: string[] | null;
  /** One-off `cancel` / `change_time`: null means every slot at those locations. */
  slotIds: string[] | null;
  action: SpecialDayAction;
  /** `HH:MM`. Recurring actions measure against it. */
  cutoffTime: string | null;
  /** `change_time` and `add_session`. */
  newStartTime: string | null;
  newEndTime: string | null;
  noteForMessages: string | null;
  noteForPdf: string | null;
  active: boolean;
}

export const ACTION_LABELS: Record<SpecialDayAction, string> = {
  off_before_cutoff_shift_overlap: "Turn off slots that end by the cutoff; move overlapping ones to start at it",
  shift_all_to_cutoff: "Move every slot that starts before the cutoff to start at it",
  cancel_matching_slots: "Cancel the slots that start before the cutoff (all of them if no cutoff)",
  cancel: "Cancel sessions",
  change_time: "Change the time",
  add_session: "Add an extra session",
};

/** The built-in rule (§7): first Saturday, every location, ends at 10:00. */
export const NATIONAL_SANITATION_DAY: Omit<SpecialDayRule, "id"> = {
  name: "National Sanitation Day",
  kind: "recurring",
  recurrence: { type: "nth_weekday", n: 1, weekday: "SAT" },
  date: null,
  endDate: null,
  locationIds: null,
  slotIds: null,
  action: "off_before_cutoff_shift_overlap",
  cutoffTime: "10:00",
  newStartTime: null,
  newEndTime: null,
  noteForMessages: "Saturday morning sessions are adjusted for National Sanitation Day, which ends at 10:00 am.",
  noteForPdf: "National Sanitation Day (first Saturday): sessions before 10:00 am are cancelled, and the 9:30 am session starts at 10:00 am.",
  active: true,
};
