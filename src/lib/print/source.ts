import { monthLabel } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { buildGrids, monthSpecials, type ViewLocation, type ViewSession } from "@/lib/schedule/month-view";

import type { SheetSource, SourceCell } from "./sheet";

export interface PrintLocation extends ViewLocation {
  pdfTitle: string;
  /** Per slot id: the day and time exactly as the old sheet wrote them. */
  labels: Record<string, { day: string; time: string }>;
}

const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const range = (from: string, to: string) =>
  from === to ? `${dayNum(from)} ${monthShort(from)}` : from.slice(0, 7) === to.slice(0, 7) ? `${dayNum(from)} – ${dayNum(to)} ${monthShort(to)}` : `${dayNum(from)} ${monthShort(from)} – ${dayNum(to)} ${monthShort(to)}`;

function cellFor(session: ViewSession | null): SourceCell {
  if (!session) return { kind: "none" };
  if (session.isCancelled) return { kind: "cancelled", reason: session.specialDayName ?? "Cancelled" };
  const names = (session.people ?? []).map((p) => p.name);
  if (session.change === "moved") return { kind: "moved", time: formatTimeRange(session.startTime, session.endTime), names };
  return { kind: "names", names };
}

/**
 * A month's sessions as the printed sheet's content: the location's sheet
 * title and colour, the day and time labels from the old sheets, a week row
 * per week, and a footnote for each special day — starred when it moved a
 * session, matching the "*" in the moved cell.
 */
export function printSource({
  congregation,
  month,
  locations,
  sessions,
  updated,
}: {
  congregation: string;
  month: string;
  locations: PrintLocation[];
  sessions: ViewSession[];
  updated: string;
}): SheetSource {
  const grids = buildGrids(locations, sessions);
  const byId = new Map(locations.map((l) => [l.id, l]));

  const tables = grids.map((grid) => {
    const location = byId.get(grid.location.id)!;
    return {
      title: location.pdfTitle || location.name.toUpperCase(),
      color: location.pdfColor,
      columns: grid.columns.map((c) => location.labels[c.slotId] ?? { day: c.weekday, time: formatTimeRange(c.startTime, c.endTime) }),
      weeks: grid.weeks.map((week) => ({ label: `Week ${week.index}`, range: range(week.from, week.to), cells: week.cells.map(cellFor) })),
    };
  });

  const notes: string[] = [];
  for (const special of monthSpecials(sessions)) {
    const moved = sessions.some((s) => s.specialDayName === special.name && s.change === "moved");
    notes.push(`${moved ? "* " : ""}${special.note ?? `${special.name}: no sessions on ${special.dates.length} ${special.dates.length === 1 ? "day" : "days"}.`}`);
  }
  // Extra sessions belong to no column; they get a line of their own.
  for (const s of sessions.filter((s) => s.slotId === null && !s.isCancelled)) {
    const names = (s.people ?? []).map((p) => p.name).join(" & ");
    const place = byId.get(s.locationId)?.name ?? "";
    const day = new Date(`${s.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    notes.push(`Extra session${s.specialDayName ? ` (${s.specialDayName})` : ""}: ${day}, ${formatTimeRange(s.startTime, s.endTime)} at ${place}${names ? ` — ${names}` : ""}.`);
  }

  return { congregation, monthTitle: monthLabel(month).toUpperCase(), tables, notes, updated };
}
