import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { assignments, members, schedules, sessions, slots, specialDayRules } from "@/db/schema";
import { resolveMonthSessions } from "@/lib/dates/sessions";
import { fromResolved, type Person, type ViewLocation, type ViewSession } from "@/lib/schedule/month-view";

import { listLocations } from "./locations";
import { getSettings } from "./settings";
import { listSpecialDays } from "./special-days";

export type ScheduleStatus = (typeof schedules.$inferSelect)["status"];

export interface MonthView {
  month: string;
  schedule: { id: string; status: ScheduleStatus; notes: string | null; imported: boolean } | null;
  locations: ViewLocation[];
  sessions: ViewSession[];
}

const hhmm = (t: string) => t.slice(0, 5);

/**
 * A month as the schedule screen shows it. A month that has a schedule shows
 * its stored sessions and pairs — for an old, imported month that is what
 * actually happened, whatever the slots say now. A month without one is
 * resolved from today's slots and special days, so you can see the dates and
 * times before anything is built.
 */
export async function getMonthView(month: string): Promise<MonthView> {
  const [places, [schedule]] = await Promise.all([listLocations(), db().select().from(schedules).where(eq(schedules.month, month)).limit(1)]);
  const locations: ViewLocation[] = places
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name,
      pdfColor: p.pdfColor,
      slots: p.slots.map((s) => ({ id: s.id, weekday: s.weekday, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime), active: s.active, sortOrder: s.sortOrder })),
    }));

  if (!schedule) {
    const [rules, settings] = await Promise.all([listSpecialDays(), getSettings()]);
    const defs = locations.flatMap((l) => l.slots.map((s) => ({ ...s, locationId: l.id })));
    const resolved = resolveMonthSessions(month, defs, rules, { weekRule: settings.weekRule, includeFifthWeek: settings.includeFifthWeek });
    return { month, schedule: null, locations, sessions: resolved.map(fromResolved) };
  }

  const rows = await db()
    .select({ session: sessions, slot: slots, ruleName: specialDayRules.name, assignment: assignments })
    .from(sessions)
    .leftJoin(slots, eq(slots.id, sessions.slotId))
    .leftJoin(specialDayRules, eq(specialDayRules.id, sessions.specialDayRuleId))
    .leftJoin(assignments, eq(assignments.sessionId, sessions.id))
    .where(eq(sessions.scheduleId, schedule.id))
    .orderBy(asc(sessions.date), asc(sessions.startTime));

  const ids = [...new Set(rows.flatMap((r) => r.assignment?.memberIds ?? []))];
  const people = ids.length
    ? await db().select({ id: members.id, name: members.displayName, title: members.title }).from(members).where(inArray(members.id, ids))
    : [];
  const byId = new Map<string, Person>(people.map((p) => [p.id, p]));

  const viewSessions: ViewSession[] = rows.map(({ session, slot, ruleName, assignment }) => {
    const start = hhmm(session.startTime);
    const end = hhmm(session.endTime);
    const originalStart = slot ? hhmm(slot.startTime) : start;
    const originalEnd = slot ? hhmm(slot.endTime) : end;
    return {
      key: session.id,
      slotId: session.slotId,
      locationId: session.locationId,
      date: session.date,
      weekIndex: session.weekIndex,
      startTime: start,
      endTime: end,
      originalStart,
      originalEnd,
      isCancelled: session.isCancelled,
      change: !session.slotId ? "added" : session.isCancelled ? "cancelled" : originalStart !== start || originalEnd !== end ? "moved" : "none",
      specialDayName: ruleName,
      note: session.note,
      people: assignment ? assignment.memberIds.map((id) => byId.get(id)).filter((p): p is Person => !!p) : null,
      locked: assignment?.locked ?? false,
      allowMixed: assignment?.allowMixed ?? false,
      reason: assignment?.reason ?? null,
    };
  });

  // Locations an old month used but that are now switched off still show.
  const shown = new Set(locations.map((l) => l.id));
  const extra = places.filter((p) => !shown.has(p.id) && viewSessions.some((s) => s.locationId === p.id));
  for (const p of extra) {
    locations.push({
      id: p.id,
      key: p.key,
      name: p.name,
      pdfColor: p.pdfColor,
      slots: p.slots.map((s) => ({ id: s.id, weekday: s.weekday, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime), active: s.active, sortOrder: s.sortOrder })),
    });
  }

  return {
    month,
    schedule: { id: schedule.id, status: schedule.status, notes: schedule.notes, imported: (schedule.notes ?? "").startsWith("Imported") },
    locations,
    sessions: viewSessions,
  };
}

/** Months that have a schedule, newest first, for the month picker. */
export async function listScheduleMonths() {
  return db().select({ month: schedules.month, status: schedules.status }).from(schedules).orderBy(asc(schedules.month));
}
