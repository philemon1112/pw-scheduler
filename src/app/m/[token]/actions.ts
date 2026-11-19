"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { AvailabilityInput, confirmSession, declineSession, saveAvailability } from "@/db/member-portal";
import { monthOf, shiftMonth, todayInAccra } from "@/lib/dates/calendar";
import { portalMember } from "@/lib/portal";
import type { Result } from "@/lib/result";

/**
 * Public actions from a member's own link. Each one checks the token itself
 * — a server action is a public endpoint, whatever page it came from.
 */

const Uuid = z.string().uuid();

async function gate(token: string) {
  try {
    return await portalMember(String(token));
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") return "limited" as const;
    return null;
  }
}

export async function confirmAction(token: string, assignmentId: string): Promise<Result> {
  const member = await gate(token);
  if (member === "limited") return { ok: false, error: "Too many tries. Please wait a minute." };
  if (!member || !Uuid.safeParse(assignmentId).success) return { ok: false, error: "That session isn't yours, or it has changed." };
  if (!(await confirmSession(db(), member.id, assignmentId))) return { ok: false, error: "That session isn't yours, or it has changed." };
  revalidatePath(`/m/${token}`);
  return { ok: true };
}

export async function declineAction(token: string, assignmentId: string, reason: string): Promise<Result> {
  const member = await gate(token);
  if (member === "limited") return { ok: false, error: "Too many tries. Please wait a minute." };
  if (!member || !Uuid.safeParse(assignmentId).success) return { ok: false, error: "That session isn't yours, or it has changed." };
  if (!(await declineSession(db(), member.id, assignmentId, String(reason ?? "").slice(0, 300)))) return { ok: false, error: "That session isn't yours, or it has changed." };
  revalidatePath(`/m/${token}`);
  revalidatePath("/schedule", "layout");
  return { ok: true };
}

/** The months someone in "ask me monthly" can confirm: this one and the next two. */
export async function confirmableMonths() {
  const current = monthOf(todayInAccra());
  return [current, shiftMonth(current, 1), shiftMonth(current, 2)];
}

export async function saveAvailabilityAction(token: string, input: z.input<typeof AvailabilityInput>): Promise<Result> {
  const member = await gate(token);
  if (member === "limited") return { ok: false, error: "Too many tries. Please wait a minute." };
  if (!member) return { ok: false, error: "This link doesn't work any more." };
  const parsed = AvailabilityInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Something didn't look right." };
  await saveAvailability(db(), member.id, parsed.data, await confirmableMonths());
  revalidatePath(`/m/${token}/availability`);
  revalidatePath("/members");
  return { ok: true };
}
