"use server";

import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, transaction } from "@/db/client";
import { dismissSwapRequest, generateMonth, ScheduleError, setAllowMixed, setCell, setLocked, setScheduleStatus, swapCells } from "@/db/mutations/schedule";
import { loadMonthInput } from "@/db/scheduler-input";
import { requireRole } from "@/lib/auth/session";
import { isMonth } from "@/lib/dates/calendar";
import type { Result } from "@/lib/result";
import { suggest, type SessionSuggestions } from "@/lib/scheduler/suggest";

/**
 * The schedule builder (§10.1). Each action checks the role, validates its
 * ids, runs one mutation in a transaction and refreshes the schedule pages.
 * A refusal the person can act on ("Unlock this session first.") comes back
 * as the error; anything else is logged and reported generically.
 */

const Uuid = z.string().uuid();
const refresh = () => revalidatePath("/schedule", "layout");

async function run<T extends object>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await work();
    refresh();
    return { ok: true, ...data };
  } catch (error) {
    if (error instanceof ScheduleError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "That didn't go through. Try again in a moment." };
  }
}

export async function generateAction(month: string): Promise<Result<{ placed: number; unfilled: number; ms: number }>> {
  const user = await requireRole("editor");
  if (!isMonth(month)) return { ok: false, error: "That month didn't look right." };
  const seed = randomInt(1, 2 ** 31 - 1);
  return run(async () => {
    const summary = await transaction((tx) => generateMonth(tx, user.id, month, seed));
    return { placed: summary.placed, unfilled: summary.unfilled, ms: summary.ms };
  });
}

export async function setCellAction(sessionId: string, memberIds: string[]): Promise<Result> {
  const user = await requireRole("editor");
  const parsed = z.object({ sessionId: Uuid, memberIds: z.array(Uuid).max(2) }).safeParse({ sessionId, memberIds });
  if (!parsed.success) return { ok: false, error: "That pair didn't look right." };
  return run(async () => {
    await transaction((tx) => setCell(tx, user.id, parsed.data.sessionId, parsed.data.memberIds));
    return {};
  });
}

export async function setLockedAction(sessionId: string, locked: boolean): Promise<Result> {
  const user = await requireRole("editor");
  if (!Uuid.safeParse(sessionId).success) return { ok: false, error: "That session didn't look right." };
  return run(async () => {
    await transaction((tx) => setLocked(tx, user.id, sessionId, locked === true));
    return {};
  });
}

export async function setAllowMixedAction(sessionId: string, allowMixed: boolean): Promise<Result> {
  const user = await requireRole("editor");
  if (!Uuid.safeParse(sessionId).success) return { ok: false, error: "That session didn't look right." };
  return run(async () => {
    await transaction((tx) => setAllowMixed(tx, user.id, sessionId, allowMixed === true));
    return {};
  });
}

export async function swapCellsAction(fromId: string, toId: string): Promise<Result> {
  const user = await requireRole("editor");
  if (!Uuid.safeParse(fromId).success || !Uuid.safeParse(toId).success) return { ok: false, error: "Those sessions didn't look right." };
  return run(async () => {
    await transaction((tx) => swapCells(tx, user.id, fromId, toId));
    return {};
  });
}

export async function setStatusAction(month: string, status: "draft" | "published"): Promise<Result> {
  const user = await requireRole("editor");
  if (!isMonth(month) || (status !== "draft" && status !== "published")) return { ok: false, error: "That didn't look right." };
  return run(async () => {
    await transaction((tx) => setScheduleStatus(tx, user.id, month, status));
    return {};
  });
}

/** "Keep them": close a can't-make-it request without changing the session. */
export async function dismissRequestAction(requestId: string): Promise<Result> {
  const user = await requireRole("editor");
  if (!Uuid.safeParse(requestId).success) return { ok: false, error: "That request didn't look right." };
  return run(async () => {
    await transaction((tx) => dismissSwapRequest(tx, user.id, requestId));
    return {};
  });
}

/** The swap panel's suggestions for one session (read-only). */
export async function suggestAction(month: string, sessionId: string): Promise<Result<{ suggestions: SessionSuggestions }>> {
  await requireRole("editor");
  if (!isMonth(month) || !Uuid.safeParse(sessionId).success) return { ok: false, error: "That session didn't look right." };
  try {
    const { input } = await loadMonthInput(db(), month);
    return { ok: true, suggestions: suggest(input, sessionId) };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Suggestions didn't load. Try again in a moment." };
  }
}
