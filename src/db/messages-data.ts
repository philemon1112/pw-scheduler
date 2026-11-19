import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { DEFAULT_TEMPLATES, type MessageKind } from "@/lib/messages/templates";
import type { MessageLocation, MessagePerson, MessageSession } from "@/lib/messages/compose";

import { readSettings } from "./scheduler-input";
import { assignments, couples, locations, members, messageTemplates, schedules, sessions, specialDayRules } from "./schema";
import type { AnyDb } from "./types";

/** Locations in the weekend message's order (D27), then any not in that list by their sort order. */
export async function messageLocations(database: AnyDb): Promise<MessageLocation[]> {
  const [settingsRow, rows] = await Promise.all([
    readSettings(database),
    database
      .select({ id: locations.id, messageName: locations.messageName, sortOrder: locations.sortOrder })
      .from(locations)
      .where(and(eq(locations.active, true), isNull(locations.archivedAt)))
      .orderBy(asc(locations.sortOrder)),
  ]);
  const order = settingsRow.messageLocationOrder ?? [];
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return [...rows].sort((a, b) => rank(a.id) - rank(b.id) || a.sortOrder - b.sortOrder).map(({ id, messageName }) => ({ id, messageName }));
}

export interface StoredMonth {
  month: string;
  status: "draft" | "published" | "archived";
}

/**
 * Stored sessions between two dates (inclusive), with their people's titles
 * and phone numbers, the couple's label and the special day's message note.
 * Months that haven't been generated have no sessions here — the messages
 * only ever describe a real schedule.
 */
export async function loadMessageSessions(database: AnyDb, from: string, to: string): Promise<{ sessions: MessageSession[]; months: StoredMonth[] }> {
  const rows = await database
    .select({
      session: sessions,
      month: schedules.month,
      status: schedules.status,
      assignmentId: assignments.id,
      memberIds: assignments.memberIds,
      coupleLabel: couples.displayLabel,
      ruleName: specialDayRules.name,
      messageNote: specialDayRules.noteForMessages,
    })
    .from(sessions)
    .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
    .leftJoin(assignments, eq(assignments.sessionId, sessions.id))
    .leftJoin(couples, eq(couples.id, assignments.coupleId))
    .leftJoin(specialDayRules, eq(specialDayRules.id, sessions.specialDayRuleId))
    .where(and(gte(sessions.date, from), lte(sessions.date, to)))
    .orderBy(asc(sessions.date), asc(sessions.startTime));

  const ids = [...new Set(rows.flatMap((r) => r.memberIds ?? []))];
  const people = ids.length
    ? await database.select({ id: members.id, title: members.title, name: members.displayName, phoneE164: members.phoneE164 }).from(members).where(inArray(members.id, ids))
    : [];
  const byId = new Map<string, MessagePerson>(people.map((p) => [p.id, p]));

  const months = new Map<string, StoredMonth>();
  for (const r of rows) months.set(r.month, { month: r.month, status: r.status });

  return {
    months: [...months.values()],
    sessions: rows.map((r) => ({
      id: r.session.id,
      assignmentId: r.assignmentId,
      date: r.session.date,
      startTime: r.session.startTime,
      endTime: r.session.endTime,
      locationId: r.session.locationId,
      isCancelled: r.session.isCancelled,
      people: (r.memberIds ?? []).map((id) => byId.get(id)).filter((p): p is MessagePerson => !!p),
      coupleLabel: r.coupleLabel,
      specialDayName: r.ruleName,
      messageNote: r.messageNote,
    })),
  };
}

/** The saved wording for each kind, or the default. */
export async function loadTemplates(database: AnyDb): Promise<Record<MessageKind, string>> {
  const rows = await database.select({ kind: messageTemplates.kind, body: messageTemplates.body }).from(messageTemplates);
  return { ...DEFAULT_TEMPLATES, ...Object.fromEntries(rows.map((r) => [r.kind, r.body])) };
}
