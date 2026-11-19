import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/db/client";
import { specialDayRules } from "@/db/schema";
import type { SpecialDayRule } from "@/lib/dates/special-days";

export const toRule = (row: typeof specialDayRules.$inferSelect): SpecialDayRule => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  recurrence: row.recurrence,
  date: row.date,
  endDate: row.endDate,
  locationIds: row.locationIds,
  slotIds: row.slotIds,
  action: row.action,
  cutoffTime: row.cutoffTime?.slice(0, 5) ?? null,
  newStartTime: row.newStartTime?.slice(0, 5) ?? null,
  newEndTime: row.newEndTime?.slice(0, 5) ?? null,
  noteForMessages: row.noteForMessages,
  noteForPdf: row.noteForPdf,
  active: row.active,
});

/** Recurring rules first, then one-off days by date. */
export async function listSpecialDays(): Promise<SpecialDayRule[]> {
  const rows = await db().select().from(specialDayRules).orderBy(asc(specialDayRules.kind), asc(specialDayRules.date), asc(specialDayRules.name));
  return rows.map(toRule).sort((a, b) => Number(a.kind === "one_off") - Number(b.kind === "one_off"));
}
