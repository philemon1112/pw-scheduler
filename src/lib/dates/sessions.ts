import { addDays, daysInMonth, monthOf, toTime, WEEKDAYS, weekdayOf, type Weekday } from "./calendar";
import type { SpecialDayRule } from "./special-days";
import { minutesOf, timeOf } from "./time";
import { calendarWeeks, nthWeekday, slotDate, weekCount, type WeekRule } from "./weeks";

/**
 * One month's sessions, with every special day applied (§6, §7).
 *
 * This is the only place a slot becomes a dated session. The generator, the
 * builder, the sheet, the messages and the calendar files all read its output,
 * so no screen can show a moved session at its old time (§7: "No screen may
 * show an original time for a moved or cancelled session").
 *
 * Cancelled sessions are kept in the result, flagged, rather than dropped:
 * the builder and the sheet show them greyed with the reason, and the
 * generator skips them.
 */

export interface SlotDef {
  id: string;
  locationId: string;
  weekday: Weekday;
  /** `HH:MM` or `HH:MM:SS`. */
  startTime: string;
  endTime: string;
  active: boolean;
  /** For a stable order inside a location. */
  sortOrder: number;
}

export interface MonthSettings {
  weekRule: WeekRule;
  includeFifthWeek: boolean;
}

export type SessionChange = "none" | "moved" | "cancelled" | "added";

export interface ResolvedSession {
  /** Stable within a month: `slotId@date`, or `ruleId@date@locationId` for an added one. */
  key: string;
  slotId: string | null;
  locationId: string;
  date: string;
  weekIndex: number;
  /** After adjustments. */
  startTime: string;
  endTime: string;
  /** The slot's own time, kept so a preview can say "moved from 9:30". */
  originalStart: string;
  originalEnd: string;
  isCancelled: boolean;
  change: SessionChange;
  specialDayRuleId: string | null;
  specialDayName: string | null;
  note: string | null;
}

const hhmm = (time: string) => time.slice(0, 5);

/** Whether a rule applies on a date, at a location. */
export function ruleApplies(rule: SpecialDayRule, date: string, locationId: string): boolean {
  if (!rule.active) return false;
  if (rule.locationIds && rule.locationIds.length > 0 && !rule.locationIds.includes(locationId)) return false;
  if (rule.kind === "recurring") {
    if (!rule.recurrence) return false;
    return nthWeekday(monthOf(date), rule.recurrence.n, rule.recurrence.weekday) === date;
  }
  if (!rule.date) return false;
  return date >= rule.date && date <= (rule.endDate ?? rule.date);
}

type Timing = { startTime: string; endTime: string; isCancelled: boolean; change: SessionChange };

/**
 * What one rule does to one session's time. Pure, and what the rule editor's
 * live preview shows slot by slot.
 */
export function applyRule(rule: SpecialDayRule, slot: { id: string; startTime: string; endTime: string }, current: Timing): Timing {
  const start = minutesOf(current.startTime);
  const end = minutesOf(current.endTime);
  const length = end - start;
  const moveTo = (newStart: number): Timing => ({ ...current, startTime: timeOf(newStart), endTime: timeOf(newStart + length), change: "moved" });
  const cancel: Timing = { ...current, isCancelled: true, change: "cancelled" };

  switch (rule.action) {
    case "off_before_cutoff_shift_overlap": {
      if (!rule.cutoffTime) return current;
      const cutoff = minutesOf(rule.cutoffTime);
      if (end <= cutoff) return cancel;
      if (start < cutoff) return moveTo(cutoff);
      return current;
    }
    case "shift_all_to_cutoff": {
      if (!rule.cutoffTime) return current;
      const cutoff = minutesOf(rule.cutoffTime);
      return start < cutoff ? moveTo(cutoff) : current;
    }
    case "cancel_matching_slots": {
      if (!rule.cutoffTime) return cancel;
      return start < minutesOf(rule.cutoffTime) ? cancel : current;
    }
    case "cancel":
      return !rule.slotIds || rule.slotIds.length === 0 || rule.slotIds.includes(slot.id) ? cancel : current;
    case "change_time": {
      if (rule.slotIds && rule.slotIds.length > 0 && !rule.slotIds.includes(slot.id)) return current;
      if (!rule.newStartTime || !rule.newEndTime) return current;
      return { ...current, startTime: hhmm(rule.newStartTime), endTime: hhmm(rule.newEndTime), change: "moved" };
    }
    case "add_session":
      return current;
  }
}

/** The week a date belongs to, under a rule; null when it belongs to no week of its month. */
export function weekOfDate(date: string, rule: WeekRule): number | null {
  const month = monthOf(date);
  if (rule === "nth_weekday") return Math.ceil(Number(date.slice(8, 10)) / 7);
  const week = calendarWeeks(month).find((w) => date >= w.start && date <= w.end);
  return week?.index ?? null;
}

export function resolveMonthSessions(month: string, slots: SlotDef[], rules: SpecialDayRule[], settings: MonthSettings): ResolvedSession[] {
  const weeks = weekCount(month, settings.weekRule);
  const lastWeek = settings.includeFifthWeek ? weeks : Math.min(weeks, 4);
  const live = slots.filter((slot) => slot.active);
  // Recurring rules first, one-off days after, so a one-off day on top of a
  // recurring one has the last word.
  const ordered = rules.filter((rule) => rule.active).sort((a, b) => Number(a.kind === "one_off") - Number(b.kind === "one_off"));

  const sessions: ResolvedSession[] = [];
  for (let week = 1; week <= lastWeek; week += 1) {
    for (const slot of live) {
      const date = slotDate(month, week, slot.weekday, settings.weekRule);
      if (!date) continue;

      let timing: Timing = { startTime: hhmm(slot.startTime), endTime: hhmm(slot.endTime), isCancelled: false, change: "none" };
      let applied: SpecialDayRule | null = null;
      for (const rule of ordered) {
        if (!ruleApplies(rule, date, slot.locationId) || rule.action === "add_session") continue;
        const next = applyRule(rule, slot, timing);
        if (next !== timing) {
          applied = rule;
          // Once cancelled, a later rule can't bring it back by moving it.
          timing = timing.isCancelled ? timing : next;
        }
      }

      sessions.push({
        key: `${slot.id}@${date}`,
        slotId: slot.id,
        locationId: slot.locationId,
        date,
        weekIndex: week,
        startTime: timing.startTime,
        endTime: timing.endTime,
        originalStart: hhmm(slot.startTime),
        originalEnd: hhmm(slot.endTime),
        isCancelled: timing.isCancelled,
        change: timing.change,
        specialDayRuleId: applied?.id ?? null,
        specialDayName: applied?.name ?? null,
        note: applied ? (applied.noteForPdf ?? applied.noteForMessages) : null,
      });
    }
  }

  // One-off extra sessions: one per location per day of the rule.
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  for (const rule of ordered) {
    if (rule.kind !== "one_off" || rule.action !== "add_session" || !rule.date || !rule.newStartTime || !rule.newEndTime) continue;
    if (!rule.locationIds || rule.locationIds.length === 0) continue;
    for (let date = rule.date; toTime(date) <= toTime(rule.endDate ?? rule.date); date = addDays(date, 1)) {
      if (date < first || date > last) continue;
      const week = weekOfDate(date, settings.weekRule);
      if (week === null || (!settings.includeFifthWeek && week > 4)) continue;
      for (const locationId of rule.locationIds) {
        sessions.push({
          key: `${rule.id}@${date}@${locationId}`,
          slotId: null,
          locationId,
          date,
          weekIndex: week,
          startTime: hhmm(rule.newStartTime),
          endTime: hhmm(rule.newEndTime),
          originalStart: hhmm(rule.newStartTime),
          originalEnd: hhmm(rule.newEndTime),
          isCancelled: false,
          change: "added",
          specialDayRuleId: rule.id,
          specialDayName: rule.name,
          note: rule.noteForPdf ?? rule.noteForMessages,
        });
      }
    }
  }

  const order = new Map(slots.map((slot) => [slot.id, slot.sortOrder]));
  return sessions.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.locationId.localeCompare(b.locationId) ||
      a.startTime.localeCompare(b.startTime) ||
      (order.get(a.slotId ?? "") ?? 99) - (order.get(b.slotId ?? "") ?? 99)
  );
}

/** Sessions at the same location whose times now overlap — possible after a shift. */
export function overlapping(sessions: ResolvedSession[]): [ResolvedSession, ResolvedSession][] {
  const live = sessions.filter((s) => !s.isCancelled);
  const pairs: [ResolvedSession, ResolvedSession][] = [];
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const [a, b] = [live[i], live[j]];
      if (a.date === b.date && a.locationId === b.locationId && minutesOf(a.startTime) < minutesOf(b.endTime) && minutesOf(b.startTime) < minutesOf(a.endTime)) {
        pairs.push([a, b]);
      }
    }
  }
  return pairs;
}

/** The next date (from `from`, inclusive) that a rule applies, for its preview. */
export function nextOccurrence(rule: SpecialDayRule, from: string): string | null {
  if (rule.kind === "one_off") return rule.date;
  if (!rule.recurrence) return null;
  for (let month = monthOf(from), i = 0; i < 24; i += 1) {
    const date = nthWeekday(month, rule.recurrence.n, rule.recurrence.weekday);
    if (date && date >= from) return date;
    const [y, m] = month.split("-").map(Number);
    month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  }
  return null;
}

export { WEEKDAYS, weekdayOf };
