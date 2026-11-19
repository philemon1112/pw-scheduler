import "server-only";

import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { assignments, locations, members, schedules, sessions } from "@/db/schema";

export interface HistorySession {
  month: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  memberIds: string[];
  isCouple: boolean;
}

export interface HistoryPerson {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Everything that has actually been served: imported months and published
 * ones (the same rule as the pair-history view), with times and places for
 * the timeline. Drafts aren't history yet.
 */
export async function getHistory(): Promise<{ sessions: HistorySession[]; people: HistoryPerson[]; months: string[] }> {
  const rows = await db()
    .select({
      month: schedules.month,
      date: sessions.date,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      location: locations.name,
      memberIds: assignments.memberIds,
      coupleId: assignments.coupleId,
    })
    .from(assignments)
    .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
    .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
    .innerJoin(locations, eq(locations.id, sessions.locationId))
    .where(and(eq(sessions.isCancelled, false), or(inArray(schedules.status, ["published", "archived"]), eq(assignments.source, "imported"))))
    .orderBy(asc(sessions.date), asc(sessions.startTime));

  const ids = [...new Set(rows.flatMap((r) => r.memberIds))];
  const people = ids.length
    ? await db()
        .select({ id: members.id, title: members.title, name: members.displayName, active: sql<boolean>`${members.active} and ${members.archivedAt} is null` })
        .from(members)
        .where(inArray(members.id, ids))
        .orderBy(asc(members.displayName))
    : [];

  return {
    sessions: rows.map((r) => ({ month: r.month, date: r.date, startTime: r.startTime, endTime: r.endTime, location: r.location, memberIds: r.memberIds, isCouple: r.coupleId !== null })),
    people: people.map((p) => ({ id: p.id, name: `${p.title} ${p.name}`, active: p.active })),
    months: [...new Set(rows.map((r) => r.month))].sort(),
  };
}
