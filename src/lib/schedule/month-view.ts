import { WEEKDAYS, type Weekday } from "@/lib/dates/calendar";
import type { ResolvedSession, SessionChange } from "@/lib/dates/sessions";

export interface Person {
  id: string;
  name: string;
  title: "Bro" | "Sis";
}

/** One session, from a stored schedule or resolved from the slots and special days. */
export interface ViewSession {
  key: string;
  slotId: string | null;
  locationId: string;
  date: string;
  weekIndex: number;
  startTime: string;
  endTime: string;
  originalStart: string;
  originalEnd: string;
  isCancelled: boolean;
  change: SessionChange;
  specialDayName: string | null;
  note: string | null;
  /** Null when nobody is assigned (or the month isn't built yet). */
  people: Person[] | null;
  locked: boolean;
  allowMixed: boolean;
  /** The scheduler's one-line reason, or "Chosen by hand". */
  reason: string | null;
}

export interface ViewLocation {
  id: string;
  key: string;
  name: string;
  pdfColor: string;
  slots: { id: string; weekday: Weekday; startTime: string; endTime: string; active: boolean; sortOrder: number }[];
}

export interface GridColumn {
  slotId: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
}

export interface GridWeek {
  index: number;
  /** First and last date that has a session in it, for "3 – 8 Nov". */
  from: string;
  to: string;
  /** One per column; null when that slot has no session this week (a month edge). */
  cells: (ViewSession | null)[];
  /** Sessions that belong to no weekly slot, like an added assembly session. */
  extras: ViewSession[];
}

export interface LocationGrid {
  location: Omit<ViewLocation, "slots">;
  columns: GridColumn[];
  weeks: GridWeek[];
}

export interface MonthSpecial {
  name: string;
  dates: string[];
  note: string | null;
}

export const fromResolved = (s: ResolvedSession): ViewSession => ({
  key: s.key,
  slotId: s.slotId,
  locationId: s.locationId,
  date: s.date,
  weekIndex: s.weekIndex,
  startTime: s.startTime,
  endTime: s.endTime,
  originalStart: s.originalStart,
  originalEnd: s.originalEnd,
  isCancelled: s.isCancelled,
  change: s.change,
  specialDayName: s.specialDayName,
  note: s.note,
  people: null,
  locked: false,
  allowMixed: false,
  reason: null,
});

const byTime = (a: { weekday: Weekday; startTime: string }, b: { weekday: Weekday; startTime: string }) =>
  WEEKDAYS.indexOf(a.weekday) - WEEKDAYS.indexOf(b.weekday) || a.startTime.localeCompare(b.startTime);

/**
 * Lays a month out the way the printed sheet does: one table per location,
 * a row per week, a column per weekly slot. A slot that has been switched off
 * keeps its column only if this month still has sessions in it — an old,
 * imported month shows what actually happened.
 */
export function buildGrids(locations: ViewLocation[], sessions: ViewSession[]): LocationGrid[] {
  return locations
    .map((location) => {
      const mine = sessions.filter((s) => s.locationId === location.id);
      const used = new Set(mine.map((s) => s.slotId));
      const columns: GridColumn[] = location.slots
        .filter((slot) => slot.active || used.has(slot.id))
        .sort((a, b) => byTime(a, b) || a.sortOrder - b.sortOrder)
        .map((slot) => ({ slotId: slot.id, weekday: slot.weekday, startTime: slot.startTime.slice(0, 5), endTime: slot.endTime.slice(0, 5) }));

      const indexes = [...new Set(mine.map((s) => s.weekIndex))].sort((a, b) => a - b);
      const weeks: GridWeek[] = indexes.map((index) => {
        const inWeek = mine.filter((s) => s.weekIndex === index);
        const dates = inWeek.map((s) => s.date).sort();
        return {
          index,
          from: dates[0],
          to: dates[dates.length - 1],
          cells: columns.map((column) => inWeek.find((s) => s.slotId === column.slotId) ?? null),
          extras: inWeek.filter((s) => s.slotId === null).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
        };
      });

      return { location: { id: location.id, key: location.key, name: location.name, pdfColor: location.pdfColor }, columns, weeks };
    })
    .filter((grid) => grid.columns.length > 0 || grid.weeks.length > 0);
}

/** The special days that touch this month, for the banner: name, the dates, the note. */
export function monthSpecials(sessions: ViewSession[]): MonthSpecial[] {
  const found = new Map<string, MonthSpecial>();
  for (const s of sessions) {
    if (!s.specialDayName || s.change === "none") continue;
    const entry = found.get(s.specialDayName) ?? { name: s.specialDayName, dates: [], note: s.note };
    if (!entry.dates.includes(s.date)) entry.dates.push(s.date);
    entry.note ??= s.note;
    found.set(s.specialDayName, entry);
  }
  return [...found.values()].map((e) => ({ ...e, dates: e.dates.sort() })).sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
}

/** Counts for the month header. */
export function monthCounts(sessions: ViewSession[]) {
  const live = sessions.filter((s) => !s.isCancelled);
  return {
    sessions: live.length,
    filled: live.filter((s) => (s.people?.length ?? 0) === 2).length,
    cancelled: sessions.length - live.length,
    moved: live.filter((s) => s.change === "moved").length,
  };
}
