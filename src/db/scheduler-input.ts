import { and, asc, eq, isNull, lt } from "drizzle-orm";

import { resolveMonthSessions } from "@/lib/dates/sessions";
import type { SpecialDayRule } from "@/lib/dates/special-days";
import type { EngineMember, EngineSession, Placement, SchedulerInput } from "@/lib/scheduler/types";

import {
  assignments,
  couples,
  memberAvailability,
  memberMonthConfirmations,
  members,
  memberUnavailableDates,
  pairHistory,
  pairRules,
  schedules,
  sessions,
  settings,
  slots,
  specialDayRules,
  locations,
} from "./schema";
import type { AnyDb } from "./types";

export type SettingsRow = typeof settings.$inferSelect;
export type ScheduleRow = typeof schedules.$inferSelect;

/** The settings row, created with its defaults if it isn't there yet. */
export async function readSettings(database: AnyDb): Promise<SettingsRow> {
  const [row] = await database.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (row) return row;
  await database.insert(settings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await database.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return created;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

export const ruleFromRow = (row: typeof specialDayRules.$inferSelect): SpecialDayRule => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  recurrence: row.recurrence,
  date: row.date,
  endDate: row.endDate,
  locationIds: row.locationIds,
  slotIds: row.slotIds,
  action: row.action,
  cutoffTime: hhmm(row.cutoffTime),
  newStartTime: hhmm(row.newStartTime),
  newEndTime: hhmm(row.newEndTime),
  noteForMessages: row.noteForMessages,
  noteForPdf: row.noteForPdf,
  active: row.active,
});

/** The month's sessions from today's slots and special days. */
export async function resolveFromSlots(database: AnyDb, month: string, settingsRow: SettingsRow) {
  const [slotRows, ruleRows] = await Promise.all([
    database
      .select({ slot: slots })
      .from(slots)
      .innerJoin(locations, eq(locations.id, slots.locationId))
      .where(and(eq(locations.active, true), isNull(locations.archivedAt)))
      .orderBy(asc(slots.sortOrder)),
    database.select().from(specialDayRules),
  ]);
  return resolveMonthSessions(
    month,
    slotRows.map(({ slot }) => ({ id: slot.id, locationId: slot.locationId, weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime, active: slot.active, sortOrder: slot.sortOrder })),
    ruleRows.map(ruleFromRow),
    { weekRule: settingsRow.weekRule, includeFifthWeek: settingsRow.includeFifthWeek }
  );
}

export interface MonthInput {
  schedule: ScheduleRow | null;
  settings: SettingsRow;
  input: SchedulerInput;
}

/**
 * Everything the engine needs for a month, read in one go. For a month with
 * a schedule the sessions and placements are the stored ones; for a month
 * without, the sessions are resolved from the slots (ids are their keys) and
 * nothing is placed.
 */
export async function loadMonthInput(database: AnyDb, month: string, seed = 1): Promise<MonthInput> {
  const [settingsRow, [schedule]] = await Promise.all([readSettings(database), database.select().from(schedules).where(eq(schedules.month, month)).limit(1)]);

  const [memberRows, availability, confirmations, away, coupleRows, ruleRows, history] = await Promise.all([
    // Fixed orders throughout: the engine is deterministic for a given input,
    // so the input must come back the same way every time (same seed, same month).
    database.select().from(members).orderBy(asc(members.displayName), asc(members.id)),
    database.select({ memberId: memberAvailability.memberId, slotId: memberAvailability.slotId }).from(memberAvailability),
    database.select({ memberId: memberMonthConfirmations.memberId }).from(memberMonthConfirmations).where(eq(memberMonthConfirmations.month, month)),
    database.select().from(memberUnavailableDates),
    database.select().from(couples).orderBy(asc(couples.memberAId)),
    database.select().from(pairRules).orderBy(asc(pairRules.memberAId), asc(pairRules.memberBId)),
    database.select({ a: pairHistory.memberLo, b: pairHistory.memberHi, month: pairHistory.month, isCouple: pairHistory.isCouple }).from(pairHistory).where(lt(pairHistory.month, month)),
  ]);

  const confirmed = new Set(confirmations.map((c) => c.memberId));
  const limits = settingsRow.privilegeLimits;
  const engineMembers: EngineMember[] = memberRows.map((m) => ({
    id: m.id,
    name: m.displayName,
    gender: m.gender,
    titleConfirmed: m.titleConfirmed,
    privilege: m.privilege,
    limit: m.maxSessionsOverride ?? limits[m.privilege] ?? 0,
    mode: m.availabilityMode,
    slotIds: availability.filter((a) => a.memberId === m.id).map((a) => a.slotId),
    confirmedThisMonth: confirmed.has(m.id),
    away: away.filter((d) => d.memberId === m.id).map((d) => ({ start: d.startDate, end: d.endDate })),
    pausedUntil: m.pausedUntil,
    active: m.active && !m.archivedAt,
    preferredLocationId: m.preferredLocationId,
  }));

  let engineSessions: EngineSession[];
  let placements: Placement[] = [];
  if (schedule) {
    const rows = await database
      .select({ session: sessions, assignment: assignments })
      .from(sessions)
      .leftJoin(assignments, eq(assignments.sessionId, sessions.id))
      .where(eq(sessions.scheduleId, schedule.id))
      .orderBy(asc(sessions.date), asc(sessions.startTime), asc(sessions.locationId), asc(sessions.id));
    engineSessions = rows.map(({ session }) => ({
      id: session.id,
      slotId: session.slotId,
      locationId: session.locationId,
      date: session.date,
      weekIndex: session.weekIndex,
      isCancelled: session.isCancelled,
    }));
    placements = rows
      .filter((r) => r.assignment)
      .map(({ session, assignment }) => ({
        sessionId: session.id,
        memberIds: assignment!.memberIds,
        coupleId: assignment!.coupleId,
        locked: assignment!.locked,
        allowMixed: assignment!.allowMixed,
        reason: assignment!.reason,
      }));
  } else {
    engineSessions = (await resolveFromSlots(database, month, settingsRow)).map((s) => ({
      id: s.key,
      slotId: s.slotId,
      locationId: s.locationId,
      date: s.date,
      weekIndex: s.weekIndex,
      isCancelled: s.isCancelled,
    }));
  }

  return {
    schedule: schedule ?? null,
    settings: settingsRow,
    input: {
      month,
      sessions: engineSessions,
      members: engineMembers,
      couples: coupleRows.map((c) => ({ id: c.id, a: c.memberAId, b: c.memberBId, alwaysTogether: c.alwaysTogether })),
      never: ruleRows.filter((r) => r.rule === "never").map((r) => [r.memberAId, r.memberBId]),
      prefer: ruleRows.filter((r) => r.rule === "prefer").map((r) => [r.memberAId, r.memberBId]),
      history,
      repeatWindowMonths: settingsRow.repeatWindowMonths,
      weights: settingsRow.scoringWeights ?? undefined,
      placements,
      seed,
    },
  };
}
