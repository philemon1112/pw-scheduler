import { WEEKDAYS, type Weekday } from "@/lib/dates/calendar";
import { nthWeekday, slotDate, type WeekRule } from "@/lib/dates/weeks";

import { cleanName } from "./names";

/**
 * Reading an old schedule sheet (§9), laid out like Lemon's: a coloured
 * location title row, a day row with merged cells, a time row starting with
 * "WEEK", then week rows with two names per cell on separate lines. Works on
 * a plain grid so it can be tested without a spreadsheet file.
 */

export interface RawCell {
  text: string;
  /** Inside another cell's merge. */
  covered: boolean;
  fill: string | null;
}

export interface ParsedTable {
  title: string;
  color: string | null;
  columns: { day: string; time: string }[];
  weeks: { week: number; cells: string[][] }[];
}

const norm = (text: string) => text.replace(/\s+/g, " ").trim();

/** The names written in a cell: one per line, without titles, moved-time notes or "No session". */
export function namesIn(text: string): string[] {
  if (/no session/i.test(text)) return [];
  return text
    .split(/\r?\n|\s*\/\s*|[ \u00a0]{2,}/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("*"))
    // "Bro & Sis Agbanawo" is a couple's label: kept whole, matched to both of them.
    .flatMap((line) => (/^bro\s*&\s*sis\s+\S/i.test(line) ? [`__couple__${cleanName(line)}`] : line.split(/\s+&\s+/)))
    .map((line) => (line.startsWith("__couple__") ? line.slice(10) : cleanName(line.replace(/^(bro|sis|brother|sister)\.?\s+/i, ""))))
    .filter((name) => name.length > 1);
}

export function parseSheet(grid: RawCell[][]): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const at = (r: number, c: number) => grid[r]?.[c];
  /** A covered cell reads as the cell whose merge covers it. */
  const textAt = (r: number, c: number) => {
    for (let k = c; k >= 0; k -= 1) {
      const cell = at(r, k);
      if (cell && !cell.covered) return norm(cell.text);
    }
    return "";
  };

  for (let r = 0; r < grid.length; r += 1) {
    if (norm(at(r, 0)?.text ?? "").toUpperCase() !== "WEEK") continue;
    const columns: ParsedTable["columns"] = [];
    for (let c = 1; c < (grid[r]?.length ?? 0) && norm(at(r, c)?.text ?? ""); c += 1) {
      columns.push({ day: r > 0 ? textAt(r - 1, c) : "", time: norm(at(r, c)!.text) });
    }
    // The title: the nearest row above the day row with any text.
    let title = "";
    let color: string | null = null;
    for (let t = r - 2; t >= 0 && t >= r - 4; t -= 1) {
      const first = grid[t]?.find((cell) => !cell.covered && norm(cell.text));
      if (first) {
        title = norm(first.text);
        color = first.fill;
        break;
      }
    }
    const weeks: ParsedTable["weeks"] = [];
    for (let w = r + 1; w < grid.length; w += 1) {
      const match = /^week\s*(\d+)/i.exec(norm(at(w, 0)?.text ?? ""));
      if (!match) break;
      weeks.push({ week: Number(match[1]), cells: columns.map((_, c) => namesIn(at(w, c + 1)?.covered ? "" : (at(w, c + 1)?.text ?? ""))) });
    }
    tables.push({ title, color, columns, weeks });
  }
  return tables;
}

/** "FRIDAY", "Fri" → FRI. */
export function weekdayFrom(label: string): Weekday | null {
  const three = label.trim().slice(0, 3).toUpperCase();
  return (WEEKDAYS as string[]).includes(three) ? (three as Weekday) : null;
}

/**
 * The start time a hand-typed label means: "6:00 – 8:00 AM" → 06:00,
 * "4:00 – 6:00pm" → 16:00, "10:00 am – 12:00 pm" → 10:00. A start without
 * its own am/pm takes the end's, except that a range ending at 12 pm started
 * in the morning.
 */
export function startFrom(label: string): string | null {
  const m = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*[–—-]\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i.exec(label);
  if (!m) return null;
  let hour = Number(m[1]);
  const endHour = Number(m[4]);
  let meridiem = m[3]?.toLowerCase();
  const endMeridiem = m[6]?.toLowerCase();
  if (!meridiem) meridiem = endMeridiem === "pm" && endHour !== 12 && hour <= endHour ? "pm" : endMeridiem === "pm" && endHour === 12 ? "am" : endMeridiem;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${m[2] ?? "00"}`;
}

/**
 * Dates for week rows (D16): by the week rule, except that a slot whose
 * column has any row outside the month is dated by n-th weekday throughout,
 * because a hand-filled sheet's four rows can only mean that month's four
 * Tuesdays (or Fridays…).
 */
export function dateRows<T extends { slotId: string; weekday: Weekday; week: number }>(month: string, rows: T[], rule: WeekRule): (T & { date: string | null })[] {
  const fallback = new Set(rows.filter((row) => !slotDate(month, row.week, row.weekday, rule)).map((row) => row.slotId));
  return rows.map((row) => ({ ...row, date: fallback.has(row.slotId) ? nthWeekday(month, row.week, row.weekday) : slotDate(month, row.week, row.weekday, rule) }));
}
