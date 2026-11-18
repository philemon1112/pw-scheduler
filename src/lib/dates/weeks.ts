import { addDays, daysInMonth, monthOf, toTime, WEEKDAYS, weekdayIndex, type Weekday } from "./calendar";

/**
 * Turning "Week n" into real dates (§6).
 *
 * Two rules, chosen in Settings:
 *
 * - **`calendar_week`** (the default — DECISIONS D14): Week n is the n-th
 *   Monday–Sunday week whose Friday falls in the month. That is how the
 *   sheets read: "Week 1 · 3 – 8 Nov", "Week 2 (Fri 13 – Sun 15 Nov)". Friday
 *   decides because the busiest days are Friday to Sunday; a week that only
 *   dips into the month on its Sunday belongs to the month before.
 * - **`nth_weekday`**: Week n is the n-th Tuesday, n-th Friday and so on.
 *
 * A date that falls outside the month — July 2026's Week 1 Tuesday is 30 June
 * — is not a session of that month. `slotDate` returns null for it.
 */

export type WeekRule = "calendar_week" | "nth_weekday";

export interface MonthWeek {
  index: number;
  /** Monday of the week (may be in the previous month). */
  start: string;
  /** Sunday of the week (may be in the next month). */
  end: string;
}

/** The Monday–Sunday weeks whose Friday falls in `month`, numbered from 1. */
export function calendarWeeks(month: string): MonthWeek[] {
  const first = `${month}-01`;
  // The first Friday on or after the 1st.
  const firstFriday = addDays(first, (4 - weekdayIndex(first) + 7) % 7);
  const weeks: MonthWeek[] = [];
  for (let friday = firstFriday, index = 1; monthOf(friday) === month; friday = addDays(friday, 7), index += 1) {
    weeks.push({ index, start: addDays(friday, -4), end: addDays(friday, 2) });
  }
  return weeks;
}

/** The n-th `weekday` of the month, or null when the month has fewer. */
export function nthWeekday(month: string, n: number, weekday: Weekday): string | null {
  const first = `${month}-01`;
  const offset = (WEEKDAYS.indexOf(weekday) - weekdayIndex(first) + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return day <= daysInMonth(month) ? `${month}-${String(day).padStart(2, "0")}` : null;
}

/** How many weeks a month has under a rule: 4 or 5. */
export function weekCount(month: string, rule: WeekRule): number {
  if (rule === "calendar_week") return calendarWeeks(month).length;
  // The most any weekday occurs in the month.
  return Math.max(...WEEKDAYS.map((weekday) => (nthWeekday(month, 5, weekday) ? 5 : 4)));
}

/** The date of `weekday` in Week `week`, or null when it isn't in the month. */
export function slotDate(month: string, week: number, weekday: Weekday, rule: WeekRule): string | null {
  if (rule === "nth_weekday") return nthWeekday(month, week, weekday);
  const range = calendarWeeks(month)[week - 1];
  if (!range) return null;
  const date = addDays(range.start, WEEKDAYS.indexOf(weekday));
  return monthOf(date) === month ? date : null;
}

/** "3 – 8 Nov": a week's dates, trimmed to the days inside the month. */
export function weekRangeLabel(month: string, week: MonthWeek): string {
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const from = toTime(week.start) < toTime(first) ? first : week.start;
  const to = toTime(week.end) > toTime(last) ? last : week.end;
  const fmt = (iso: string, withMonth: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", ...(withMonth ? { month: "short" } : {}), timeZone: "UTC" });
  return `${fmt(from, monthOf(from) !== monthOf(to))} – ${fmt(to, true)}`;
}
