import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { suggest } from "@/lib/scheduler/suggest";
import { hashToken, looksLikeToken } from "@/lib/tokens";

import { audit } from "./audit";
import { loadMonthInput } from "./scheduler-input";
import {
  assignments,
  locations,
  memberAvailability,
  memberMonthConfirmations,
  members,
  memberUnavailableDates,
  schedules,
  sessions,
  slots,
  specialDayRules,
  swapRequests,
} from "./schema";
import type { AnyDb } from "./types";

/**
 * What a member sees and does from their private link (§10, §13, §14):
 * their own sessions and their partner's name — never anyone else's phone,
 * never other members — their availability, and confirm or "I can't make it".
 * No account: the token is the key, checked on every call.
 */

export type PortalMember = Pick<typeof members.$inferSelect, "id" | "title" | "displayName" | "availabilityMode">;

export async function memberForToken(database: AnyDb, token: string): Promise<PortalMember | null> {
  if (!looksLikeToken(token)) return null;
  const [row] = await database
    .select({ id: members.id, title: members.title, displayName: members.displayName, availabilityMode: members.availabilityMode })
    .from(members)
    .where(and(eq(members.publicTokenHash, hashToken(token)), isNull(members.archivedAt), eq(members.active, true)))
    .limit(1);
  return row ?? null;
}

export interface PortalSession {
  assignmentId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  partners: string[];
  status: "pending" | "confirmed" | "declined" | "swapped";
  confirmedByMe: boolean;
  request: { status: "open" | "approved" | "rejected" | "withdrawn"; reason: string | null } | null;
  specialDayName: string | null;
  moved: boolean;
  updatedAt: Date;
}

/** Their sessions in published months from `from` on (drafts aren't final, so they aren't shown). */
export async function memberSessions(database: AnyDb, memberId: string, from: string): Promise<PortalSession[]> {
  const rows = await database
    .select({ assignment: assignments, session: sessions, location: locations.messageName, slotStart: slots.startTime, ruleName: specialDayRules.name })
    .from(assignments)
    .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
    .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
    .innerJoin(locations, eq(locations.id, sessions.locationId))
    .leftJoin(slots, eq(slots.id, sessions.slotId))
    .leftJoin(specialDayRules, eq(specialDayRules.id, sessions.specialDayRuleId))
    .where(and(sql`${assignments.memberIds} @> array[${memberId}]::uuid[]`, eq(schedules.status, "published"), gte(sessions.date, from), eq(sessions.isCancelled, false)))
    .orderBy(asc(sessions.date), asc(sessions.startTime));

  const partnerIds = [...new Set(rows.flatMap((r) => r.assignment.memberIds).filter((id) => id !== memberId))];
  const partners = partnerIds.length ? await database.select({ id: members.id, title: members.title, name: members.displayName }).from(members).where(inArray(members.id, partnerIds)) : [];
  const nameOf = new Map(partners.map((p) => [p.id, `${p.title} ${p.name}`]));
  const requests = rows.length
    ? await database
        .select()
        .from(swapRequests)
        .where(and(eq(swapRequests.memberId, memberId), inArray(swapRequests.assignmentId, rows.map((r) => r.assignment.id))))
        .orderBy(asc(swapRequests.createdAt))
    : [];

  return rows.map(({ assignment, session, location, slotStart, ruleName }) => {
    const request = requests.filter((r) => r.assignmentId === assignment.id).at(-1);
    return {
      assignmentId: assignment.id,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      location,
      partners: assignment.memberIds.filter((id) => id !== memberId).map((id) => nameOf.get(id) ?? "Someone"),
      status: assignment.status,
      confirmedByMe: assignment.confirmedMemberIds.includes(memberId),
      request: request ? { status: request.status, reason: request.reason } : null,
      specialDayName: ruleName,
      moved: slotStart !== null && slotStart.slice(0, 5) !== session.startTime.slice(0, 5),
      updatedAt: assignment.updatedAt,
    };
  });
}

/** One of their own assignments in a published month, or null — the check before any change. */
async function ownAssignment(database: AnyDb, memberId: string, assignmentId: string) {
  const [row] = await database
    .select({ assignment: assignments, month: schedules.month })
    .from(assignments)
    .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
    .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
    .where(and(eq(assignments.id, assignmentId), sql`${assignments.memberIds} @> array[${memberId}]::uuid[]`, eq(schedules.status, "published")))
    .limit(1);
  return row ?? null;
}

export async function confirmSession(database: AnyDb, memberId: string, assignmentId: string): Promise<boolean> {
  const row = await ownAssignment(database, memberId, assignmentId);
  if (!row) return false;
  const confirmed = [...new Set([...row.assignment.confirmedMemberIds, memberId])];
  await database
    .update(assignments)
    .set({ confirmedMemberIds: confirmed, status: confirmed.length >= row.assignment.memberIds.length ? "confirmed" : "pending", updatedAt: sql`now()` })
    .where(eq(assignments.id, assignmentId));
  await audit(database, { userId: null, action: "member_confirmed", entity: "assignment", entityId: assignmentId, diff: { memberId } });
  return true;
}

/**
 * "I can't make it": a swap request for the builder, with the engine's top
 * three people who could step in, so the owner can act on it in one tap.
 */
export async function declineSession(database: AnyDb, memberId: string, assignmentId: string, reason: string): Promise<boolean> {
  const row = await ownAssignment(database, memberId, assignmentId);
  if (!row) return false;
  const [open] = await database
    .select({ id: swapRequests.id })
    .from(swapRequests)
    .where(and(eq(swapRequests.assignmentId, assignmentId), eq(swapRequests.memberId, memberId), eq(swapRequests.status, "open")));
  if (open) return true;

  let suggested: string[] = [];
  try {
    const { input } = await loadMonthInput(database, row.month);
    suggested = (suggest(input, row.assignment.sessionId).replace[memberId] ?? []).map((s) => s.memberIds[0]);
  } catch {
    suggested = [];
  }
  await database.insert(swapRequests).values({ assignmentId, memberId, reason: reason.trim() || null, suggestedMemberIds: suggested });
  await database
    .update(assignments)
    .set({ status: "declined", confirmedMemberIds: row.assignment.confirmedMemberIds.filter((id) => id !== memberId), updatedAt: sql`now()` })
    .where(eq(assignments.id, assignmentId));
  await audit(database, { userId: null, action: "member_declined", entity: "assignment", entityId: assignmentId, diff: { memberId } });
  return true;
}

export const AvailabilityInput = z
  .object({
    mode: z.enum(["specific", "flexible", "ask_monthly"]),
    slotIds: z.array(z.string().uuid()).max(50),
    away: z
      .array(z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().trim().max(120) }))
      .max(20)
      .refine((ranges) => ranges.every((r) => r.end >= r.start), "An away period ends before it starts."),
    /** Months they confirm they're available for (ask-me-monthly). */
    confirmMonths: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).max(3),
  })
  .refine((v) => v.mode !== "specific" || v.slotIds.length > 0, { message: "Tick at least one slot, or choose “Any slot”.", path: ["slotIds"] });

export async function availabilityFor(database: AnyDb, memberId: string, months: string[]) {
  const [ticked, away, confirmed] = await Promise.all([
    database.select({ slotId: memberAvailability.slotId }).from(memberAvailability).where(eq(memberAvailability.memberId, memberId)),
    database.select().from(memberUnavailableDates).where(eq(memberUnavailableDates.memberId, memberId)).orderBy(asc(memberUnavailableDates.startDate)),
    months.length
      ? database.select({ month: memberMonthConfirmations.month }).from(memberMonthConfirmations).where(and(eq(memberMonthConfirmations.memberId, memberId), inArray(memberMonthConfirmations.month, months)))
      : Promise.resolve([]),
  ]);
  return {
    slotIds: ticked.map((t) => t.slotId),
    away: away.map((a) => ({ start: a.startDate, end: a.endDate, reason: a.reason ?? "" })),
    confirmedMonths: confirmed.map((c) => c.month),
  };
}

/** Saves what they set on their availability page. Only slots that exist and are active are kept. */
export async function saveAvailability(database: AnyDb, memberId: string, input: z.infer<typeof AvailabilityInput>, months: string[]) {
  const live = input.slotIds.length ? await database.select({ id: slots.id }).from(slots).where(and(inArray(slots.id, input.slotIds), eq(slots.active, true))) : [];
  await database.update(members).set({ availabilityMode: input.mode, updatedAt: sql`now()` }).where(eq(members.id, memberId));
  await database.delete(memberAvailability).where(eq(memberAvailability.memberId, memberId));
  if (live.length) await database.insert(memberAvailability).values(live.map((s) => ({ memberId, slotId: s.id })));
  await database.delete(memberUnavailableDates).where(eq(memberUnavailableDates.memberId, memberId));
  if (input.away.length) await database.insert(memberUnavailableDates).values(input.away.map((a) => ({ memberId, startDate: a.start, endDate: a.end, reason: a.reason || null })));
  if (months.length) {
    await database.delete(memberMonthConfirmations).where(and(eq(memberMonthConfirmations.memberId, memberId), inArray(memberMonthConfirmations.month, months)));
    const wanted = input.confirmMonths.filter((m) => months.includes(m));
    if (wanted.length) await database.insert(memberMonthConfirmations).values(wanted.map((month) => ({ memberId, month })));
  }
  await audit(database, { userId: null, action: "member_availability", entity: "member", entityId: memberId, diff: { mode: input.mode, slots: live.length, away: input.away.length } });
}
