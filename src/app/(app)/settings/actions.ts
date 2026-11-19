"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z as zod } from "zod";

import { audit } from "@/db/audit";
import { db, transaction } from "@/db/client";
import { saveSettings, SettingsInput } from "@/db/mutations/settings";
import { changePassword, InviteInput, inviteUser, renewInvite, setUserDisabled, setUserRole, UserError } from "@/db/mutations/users";
import { settings } from "@/db/schema";
import { requireRole, requireUser } from "@/lib/auth/session";
import { firstIssue, type Result } from "@/lib/result";
import { DEFAULT_WEIGHTS } from "@/lib/scheduler/problem";
import { appUrl } from "@/lib/tokens";

/** Settings are the owner's (§2): editors can see them, not change them. */
export async function saveSettingsAction(input: zod.input<typeof SettingsInput>): Promise<Result> {
  const user = await requireRole("owner");
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await transaction((tx) => saveSettings(tx, user.id, parsed.data));
  revalidatePath("/", "layout");
  return { ok: true };
}


const Id = zod.string().uuid();
const inviteUrl = (token: string) => `${appUrl()}/invite/${token}`;

async function guarded<T extends object>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await work();
    revalidatePath("/settings", "layout");
    return { ok: true, ...data };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    console.error(error instanceof Error ? error.message : error);
    return { ok: false, error: "That didn't go through. Try again in a moment." };
  }
}

/** Owner only (§2): add an editor or viewer; returns the one-time invite link to send them. */
export async function inviteAction(input: zod.input<typeof InviteInput>): Promise<Result<{ url: string }>> {
  const owner = await requireRole("owner");
  const parsed = InviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  return guarded(async () => ({ url: inviteUrl((await transaction((tx) => inviteUser(tx, owner.id, parsed.data))).token) }));
}

export async function renewInviteAction(userId: string): Promise<Result<{ url: string }>> {
  const owner = await requireRole("owner");
  if (!Id.safeParse(userId).success) return { ok: false, error: "That account didn't look right." };
  return guarded(async () => ({ url: inviteUrl(await transaction((tx) => renewInvite(tx, owner.id, userId))) }));
}

export async function setRoleAction(userId: string, role: "editor" | "viewer"): Promise<Result> {
  const owner = await requireRole("owner");
  if (!Id.safeParse(userId).success || (role !== "editor" && role !== "viewer")) return { ok: false, error: "That didn't look right." };
  return guarded(async () => (await transaction((tx) => setUserRole(tx, owner.id, userId, role)), {}));
}

export async function setDisabledAction(userId: string, disabled: boolean): Promise<Result> {
  const owner = await requireRole("owner");
  if (!Id.safeParse(userId).success) return { ok: false, error: "That account didn't look right." };
  return guarded(async () => (await transaction((tx) => setUserDisabled(tx, owner.id, userId, disabled === true)), {}));
}

/** Anyone signed in: their own password. */
export async function changePasswordAction(current: string, next: string): Promise<Result> {
  const user = await requireUser();
  if (typeof current !== "string" || typeof next !== "string") return { ok: false, error: "That didn't look right." };
  return guarded(async () => (await transaction((tx) => changePassword(tx, user.id, current, next)), {}));
}

const Weights = zod.object(Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, zod.number().min(-1000).max(10000)])) as Record<keyof typeof DEFAULT_WEIGHTS, zod.ZodNumber>);

/** Owner only: the scheduler's scoring weights (advanced). Null resets to the defaults. */
export async function saveWeightsAction(weights: Partial<Record<keyof typeof DEFAULT_WEIGHTS, number>> | null): Promise<Result> {
  const owner = await requireRole("owner");
  const parsed = weights === null ? null : Weights.safeParse(weights);
  if (parsed && !parsed.success) return { ok: false, error: "Each weight is a number between -1000 and 10000." };
  const value = parsed ? parsed.data : null;
  await db().insert(settings).values({ id: 1, scoringWeights: value }).onConflictDoUpdate({ target: settings.id, set: { scoringWeights: value, updatedAt: sql`now()` } });
  await audit(db(), { userId: owner.id, action: "update", entity: "settings", diff: { scoringWeights: value } });
  revalidatePath("/settings");
  return { ok: true };
}
