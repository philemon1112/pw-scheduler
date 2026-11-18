import { TZDate } from "@date-fns/tz";

/**
 * Plain calendar arithmetic on `YYYY-MM-DD` strings.
 *
 * Everything in the rota is a wall-clock date in Accra, which has no daylight
 * saving and sits on UTC all year. Doing the arithmetic on UTC midnights is
 * therefore exact, and keeping dates as strings means a date can never pick
 * up a timezone on its way through the app and come out a day early.
 */

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
export const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

const DAY = 86_400_000;

export const toTime = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
export const fromTime = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => fromTime(toTime(iso) + days * DAY);

/** Monday = 0 … Sunday = 6. */
export const weekdayIndex = (iso: string) => (new Date(toTime(iso)).getUTCDay() + 6) % 7;
export const weekdayOf = (iso: string): Weekday => WEEKDAYS[weekdayIndex(iso)];

export const monthOf = (iso: string) => iso.slice(0, 7);

export function daysInMonth(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 0)).getUTCDate();
}

export function shiftMonth(month: string, delta: number): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index - 1 + delta, 1)).toISOString().slice(0, 7);
}

export const isMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Today in Accra, as `YYYY-MM-DD`. */
export function todayInAccra(now: Date = new Date()): string {
  const local = new TZDate(now, "Africa/Accra");
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

/** `2026-11` → "November 2026". */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** `2026-11-06` → "Fri 6 Nov". */
export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
