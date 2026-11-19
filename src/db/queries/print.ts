import "server-only";

import { eq, max } from "drizzle-orm";

import { db } from "@/db/client";
import { assignments, printLayouts, sessions } from "@/db/schema";
import { buildSheet, type Sheet, type SheetLayout } from "@/lib/print/sheet";
import { printSource, type PrintLocation } from "@/lib/print/source";

import { listLocations } from "./locations";
import { getMonthView } from "./schedule";
import { getSettings } from "./settings";

export interface PrintSettings {
  orientation: "landscape" | "portrait";
  margins: "normal" | "narrow";
  fitToWidth: boolean;
  fontSize: number;
}

export interface PrintData {
  month: string;
  hasSchedule: boolean;
  sheet: Sheet;
  layout: SheetLayout;
  settings: PrintSettings;
}

export const DEFAULT_PRINT: PrintSettings = { orientation: "landscape", margins: "normal", fitToWidth: true, fontSize: 11 };

const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" });

/**
 * Everything the sheet editor, the print page and the export need for a
 * month: the sheet built from the schedule (or the bare month when it isn't
 * built), and the layout saved for it. "Updated" is the last time anything
 * on the sheet changed — a pair, the schedule, or the layout.
 */
export async function getPrintData(month: string): Promise<PrintData> {
  const [view, places, settings] = await Promise.all([getMonthView(month), listLocations(), getSettings()]);
  const full = new Map(places.map((p) => [p.id, p]));
  const locations: PrintLocation[] = view.locations.map((l) => {
    const place = full.get(l.id);
    return {
      ...l,
      pdfTitle: place?.pdfTitle ?? l.name,
      labels: Object.fromEntries((place?.slots ?? []).map((s) => [s.id, { day: s.pdfDayLabel, time: s.pdfTimeLabel }])),
    };
  });

  let layoutRow: typeof printLayouts.$inferSelect | undefined;
  let updated = new Date();
  if (view.schedule) {
    const [[row], [latest]] = await Promise.all([
      db().select().from(printLayouts).where(eq(printLayouts.scheduleId, view.schedule.id)).limit(1),
      db()
        .select({ at: max(assignments.updatedAt) })
        .from(assignments)
        .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
        .where(eq(sessions.scheduleId, view.schedule.id)),
    ]);
    layoutRow = row;
    const times = [latest?.at, row?.updatedAt].filter((t): t is Date => t instanceof Date);
    if (times.length) updated = new Date(Math.max(...times.map((t) => t.getTime())));
  }

  const sheet = buildSheet(printSource({ congregation: settings.congregationName, month, locations, sessions: view.sessions, updated: longDate(updated) }));
  return {
    month,
    hasSchedule: view.schedule !== null,
    sheet,
    layout: {
      columnWidths: layoutRow?.columnWidths ?? {},
      rowHeights: layoutRow?.rowHeights ?? {},
      cellOverrides: layoutRow?.cellOverrides ?? {},
    },
    settings: layoutRow
      ? { orientation: layoutRow.orientation, margins: layoutRow.margins, fitToWidth: layoutRow.fitToWidth, fontSize: layoutRow.fontSize }
      : DEFAULT_PRINT,
  };
}
