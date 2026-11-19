import { WEEKDAY_NAMES } from "@/lib/dates/calendar";
import type { SpecialDayRule } from "@/lib/dates/special-days";
import { formatTime, formatTimeRange } from "@/lib/dates/time";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th", "5th"];

const day = (iso: string, withYear = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

/** "Every month · 1st Saturday" / "Sat 12 – Sun 13 Dec 2026". */
export function whenLabel(rule: SpecialDayRule): string {
  if (rule.kind === "recurring" && rule.recurrence) return `Every month · ${ORDINAL[rule.recurrence.n]} ${WEEKDAY_NAMES[rule.recurrence.weekday]}`;
  if (!rule.date) return "No date set";
  return rule.endDate && rule.endDate !== rule.date ? `${day(rule.date)} – ${day(rule.endDate, true)}` : day(rule.date, true);
}

/** "Off before 10:00 am; overlapping slots move to 10:00 am". */
export function whatLabel(rule: SpecialDayRule): string {
  const cutoff = rule.cutoffTime ? formatTime(rule.cutoffTime) : null;
  switch (rule.action) {
    case "off_before_cutoff_shift_overlap":
      return `Slots ending by ${cutoff} are off; ones running past it start at ${cutoff}`;
    case "shift_all_to_cutoff":
      return `Every slot starting before ${cutoff} starts at ${cutoff}`;
    case "cancel_matching_slots":
      return cutoff ? `Slots starting before ${cutoff} are cancelled` : "Every slot that day is cancelled";
    case "cancel":
      return rule.slotIds?.length ? `${rule.slotIds.length} chosen ${rule.slotIds.length === 1 ? "slot is" : "slots are"} cancelled` : "Every session is cancelled";
    case "change_time":
      return rule.newStartTime && rule.newEndTime ? `Moved to ${formatTimeRange(rule.newStartTime, rule.newEndTime)}` : "New time not set";
    case "add_session":
      return rule.newStartTime && rule.newEndTime ? `Extra session, ${formatTimeRange(rule.newStartTime, rule.newEndTime)}` : "Time not set";
  }
}
