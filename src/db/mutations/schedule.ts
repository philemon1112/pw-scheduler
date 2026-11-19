import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { generate } from "@/lib/scheduler/generate";
import type { Evaluation } from "@/lib/scheduler/types";

import { audit } from "../audit";
import { loadMonthInput, readSettings, resolveFromSlots } from "../scheduler-input";
import { assignments, couples, members, schedules, sessions, swapRequests } from "../schema";
import type { AnyDb } from "../types";

/** A refusal with a message that can go straight into a toast. */
export class ScheduleError extends Error {}

const sessionKey = (s: { slotId: string | null; specialDayRuleId: string | null; date: string; locationId: string }) =>
  s.slotId ? `${s.slotId}@${s.date}` : `${s.specialDayRuleId}@${s.date}@${s.locationId}`;

/**
 * Makes the stored sessions match the month as it resolves today: new slots
 * and special days add sessions, changed times are updated, and sessions
 * that no longer exist go (with their pairs). A session that a special day
 * has cancelled loses its pair too — nobody can serve it.
 */
export async function syncMonthSessions(tx: AnyDb, month: string) {
  const settingsRow = await readSettings(tx);
  const resolved = await resolveFromSlots(tx, month, settingsRow);
  let [schedule] = await tx.select().from(schedules).where(eq(schedules.month, month)).limit(1);
  if (!schedule) [schedule] = await tx.insert(schedules).values({ month, status: "draft" }).returning();

  const stored = await tx.select().from(sessions).where(eq(sessions.scheduleId, schedule.id));
  const byKey = new Map(stored.map((s) => [sessionKey(s), s]));
  const wanted = new Set<string>();
  let added = 0;

  for (const r of resolved) {
    wanted.add(r.key);
    const values = {
      locationId: r.locationId,
      date: r.date,
      startTime: r.startTime,
      endTime: r.endTime,
      weekIndex: r.weekIndex,
      isCancelled: r.isCancelled,
      specialDayRuleId: r.specialDayRuleId,
      note: r.note,
    };
    const existing = byKey.get(r.key);
    if (!existing) {
      await tx.insert(sessions).values({ scheduleId: schedule.id, slotId: r.slotId, ...values });
      added += 1;
    } else if (
      existing.startTime.slice(0, 5) !== r.startTime.slice(0, 5) ||
      existing.endTime.slice(0, 5) !== r.endTime.slice(0, 5) ||
      existing.isCancelled !== r.isCancelled ||
      existing.weekIndex !== r.weekIndex ||
      existing.specialDayRuleId !== r.specialDayRuleId ||
      existing.note !== r.note
    ) {
      await tx.update(sessions).set({ ...values, updatedAt: sql`now()` }).where(eq(sessions.id, existing.id));
    }
  }

  const stale = stored.filter((s) => !wanted.has(sessionKey(s))).map((s) => s.id);
  if (stale.length > 0) await tx.delete(sessions).where(inArray(sessions.id, stale));
  const cancelled = await tx
    .delete(assignments)
    .where(inArray(assignments.sessionId, tx.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.scheduleId, schedule.id), eq(sessions.isCancelled, true)))))
    .returning({ id: assignments.id });

  return { schedule, added, removed: stale.length, clearedCancelled: cancelled.length };
}

export interface GenerateSummary {
  placed: number;
  unfilled: number;
  ms: number;
  seed: number;
  evaluation: Evaluation;
}

/**
 * Generate / Regenerate unlocked: brings the sessions up to date, keeps
 * every locked pair exactly, and replaces everything else with a fresh run
 * of the engine.
 */
export async function generateMonth(tx: AnyDb, userId: string, month: string, seed: number): Promise<GenerateSummary> {
  const [existing] = await tx.select().from(schedules).where(eq(schedules.month, month)).limit(1);
  if (existing?.status === "archived") throw new ScheduleError("This is a past month, kept as it was served. It can't be rebuilt.");
  if (existing?.status === "published") throw new ScheduleError("This month is published. Move it back to draft before rebuilding it.");

  const { schedule } = await syncMonthSessions(tx, month);
  const { input } = await loadMonthInput(tx, month, seed);
  const result = generate(input);

  await tx
    .delete(assignments)
    .where(and(eq(assignments.locked, false), inArray(assignments.sessionId, tx.select({ id: sessions.id }).from(sessions).where(eq(sessions.scheduleId, schedule.id)))));
  const fresh = result.placements.filter((p) => !p.locked);
  if (fresh.length > 0) {
    await tx.insert(assignments).values(
      fresh.map((p) => ({
        sessionId: p.sessionId,
        memberIds: p.memberIds,
        coupleId: p.coupleId,
        allowMixed: p.allowMixed,
        locked: false,
        source: "generated" as const,
        status: "pending" as const,
        reason: p.reason ?? null,
      }))
    );
  }
  await tx.update(schedules).set({ generatedSeed: seed, generatedAt: sql`now()`, updatedAt: sql`now()` }).where(eq(schedules.id, schedule.id));
  const unfilled = result.evaluation.issues.filter((i) => i.kind === "unfilled").length;
  await audit(tx, { userId, action: "generate", entity: "schedule", entityId: schedule.id, diff: { month, seed, placed: fresh.length, unfilled, ms: result.ms } });
  return { placed: fresh.length, unfilled, ms: result.ms, seed, evaluation: result.evaluation };
}

/** The session and its month, refusing past (archived) months and cancelled sessions. */
async function editableSession(tx: AnyDb, sessionId: string) {
  const [row] = await tx
    .select({ session: sessions, schedule: schedules })
    .from(sessions)
    .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) throw new ScheduleError("That session isn't there any more. Refresh the page.");
  if (row.schedule.status === "archived") throw new ScheduleError("Past months are kept as they were served.");
  if (row.session.isCancelled) throw new ScheduleError("That session is cancelled for a special day.");
  const [assignment] = await tx.select().from(assignments).where(eq(assignments.sessionId, sessionId)).limit(1);
  return { ...row, assignment: assignment ?? null };
}

async function coupleOf(tx: AnyDb, memberIds: string[]): Promise<string | null> {
  if (memberIds.length !== 2) return null;
  const [lo, hi] = [...memberIds].sort();
  const [row] = await tx.select({ id: couples.id }).from(couples).where(and(eq(couples.memberAId, lo), eq(couples.memberBId, hi))).limit(1);
  return row?.id ?? null;
}

/**
 * Puts people in a session by hand (the panel's picker or a suggestion).
 * Hand edits may break a soft or even a hard rule — the builder then shows
 * the warning — but they must name real, distinct people.
 */
export async function setCell(tx: AnyDb, userId: string, sessionId: string, memberIds: string[]) {
  const { session, assignment } = await editableSession(tx, sessionId);
  if (assignment?.locked) throw new ScheduleError("Unlock this session first.");
  const ids = [...new Set(memberIds)];
  if (ids.length !== memberIds.length) throw new ScheduleError("Someone is in there twice.");
  if (ids.length > 2) throw new ScheduleError("A session takes two people.");
  if (ids.length > 0) {
    const found = await tx.select({ id: members.id }).from(members).where(inArray(members.id, ids));
    if (found.length !== ids.length) throw new ScheduleError("Someone in that pair isn't in the members list.");
  }

  if (ids.length === 0) {
    if (assignment) await tx.delete(assignments).where(eq(assignments.id, assignment.id));
  } else {
    // Confirmations stay with the people who gave them.
    const confirmed = (assignment?.confirmedMemberIds ?? []).filter((id) => ids.includes(id));
    const values = {
      memberIds: ids,
      coupleId: await coupleOf(tx, ids),
      source: "manual" as const,
      status: confirmed.length === ids.length ? ("confirmed" as const) : ("pending" as const),
      confirmedMemberIds: confirmed,
      reason: "Chosen by hand",
    };
    if (assignment) {
      await tx.update(assignments).set({ ...values, updatedAt: sql`now()` }).where(eq(assignments.id, assignment.id));
      // Someone who said they can't make it and has now been replaced: their request is done.
      await tx
        .update(swapRequests)
        .set({ status: "approved", resolvedBy: userId, resolvedAt: sql`now()`, updatedAt: sql`now()` })
        .where(and(eq(swapRequests.assignmentId, assignment.id), eq(swapRequests.status, "open"), ids.length ? notInArray(swapRequests.memberId, ids) : sql`true`));
    } else await tx.insert(assignments).values({ sessionId, ...values });
  }
  await audit(tx, { userId, action: "update", entity: "assignment", entityId: session.id, diff: { before: assignment?.memberIds ?? [], after: ids } });
}

export async function setLocked(tx: AnyDb, userId: string, sessionId: string, locked: boolean) {
  const { assignment } = await editableSession(tx, sessionId);
  if (!assignment) throw new ScheduleError("There's nobody here to lock yet.");
  await tx.update(assignments).set({ locked, updatedAt: sql`now()` }).where(eq(assignments.id, assignment.id));
  await audit(tx, { userId, action: locked ? "lock" : "unlock", entity: "assignment", entityId: assignment.id });
}

export async function setAllowMixed(tx: AnyDb, userId: string, sessionId: string, allowMixed: boolean) {
  const { assignment } = await editableSession(tx, sessionId);
  if (!assignment) throw new ScheduleError("Place someone here first, then allow a mixed pair.");
  await tx.update(assignments).set({ allowMixed, updatedAt: sql`now()` }).where(eq(assignments.id, assignment.id));
  await audit(tx, { userId, action: "update", entity: "assignment", entityId: assignment.id, diff: { allowMixed } });
}

/**
 * Drag and drop: the two sessions trade people. "Allow mixed pair" stays with
 * the session — it is an exception for that place and time, not for the pair.
 */
export async function swapCells(tx: AnyDb, userId: string, fromId: string, toId: string) {
  if (fromId === toId) return;
  const from = await editableSession(tx, fromId);
  const to = await editableSession(tx, toId);
  if (from.schedule.id !== to.schedule.id) throw new ScheduleError("Those sessions are in different months.");
  if (from.assignment?.locked || to.assignment?.locked) throw new ScheduleError("Unlock both sessions to swap them.");
  if (!from.assignment && !to.assignment) return;

  const ids = [from.assignment?.id, to.assignment?.id].filter((id): id is string => !!id);
  await tx.delete(assignments).where(inArray(assignments.id, ids));
  const moved = (people: typeof from.assignment, sessionId: string, keepMixed: boolean) =>
    people ? [{ sessionId, memberIds: people.memberIds, coupleId: people.coupleId, allowMixed: keepMixed, source: "manual" as const, status: "pending" as const, reason: "Swapped by hand" }] : [];
  const rows = [...moved(from.assignment, toId, to.assignment?.allowMixed ?? false), ...moved(to.assignment, fromId, from.assignment?.allowMixed ?? false)];
  if (rows.length > 0) await tx.insert(assignments).values(rows);
  await audit(tx, { userId, action: "swap", entity: "assignment", diff: { from: fromId, to: toId } });
}

/** Keep the person after all: their "can't make it" request is closed and nothing changes. */
export async function dismissSwapRequest(tx: AnyDb, userId: string, requestId: string) {
  const [row] = await tx
    .update(swapRequests)
    .set({ status: "rejected", resolvedBy: userId, resolvedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(swapRequests.id, requestId), eq(swapRequests.status, "open")))
    .returning({ id: swapRequests.id });
  if (!row) throw new ScheduleError("That request has already been dealt with.");
  await audit(tx, { userId, action: "swap_rejected", entity: "swap_request", entityId: requestId });
}

/** Publish, or move back to draft. Published months count as history for the no-repeat rule. */
export async function setScheduleStatus(tx: AnyDb, userId: string, month: string, status: "draft" | "published") {
  const [schedule] = await tx.select().from(schedules).where(eq(schedules.month, month)).limit(1);
  if (!schedule) throw new ScheduleError("Generate the month before publishing it.");
  if (schedule.status === "archived") throw new ScheduleError("Past months are kept as they were served.");
  await tx
    .update(schedules)
    .set({ status, publishedAt: status === "published" ? sql`now()` : schedule.publishedAt, updatedAt: sql`now()` })
    .where(eq(schedules.id, schedule.id));
  await audit(tx, { userId, action: status === "published" ? "publish" : "unpublish", entity: "schedule", entityId: schedule.id, diff: { month } });
}
