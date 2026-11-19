"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { audit } from "@/db/audit";
import { db, transaction } from "@/db/client";
import { saveMember } from "@/db/mutations/members";
import { members, settings } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import { MemberInput } from "@/lib/members/input";
import { firstIssue, type Result } from "@/lib/result";
import { hashToken, memberUrl, newToken, openToken, sealToken } from "@/lib/tokens";

/**
 * Members (§10.3). Thin on purpose: check who is asking, validate, hand off
 * to `db/mutations/members.ts`, refresh the page. Editors and the owner can
 * change members; only the owner changes the privilege limits, which are a
 * setting (§2).
 */

const refresh = () => revalidatePath("/members");

export async function saveMemberAction(input: z.input<typeof MemberInput>): Promise<Result<{ id: string }>> {
  const user = await requireRole("editor");
  const parsed = MemberInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await transaction((tx) => saveMember(tx, user.id, parsed.data));
  if (result.ok) refresh();
  return result;
}

/** "Confirm all": the titles in the seed were guesses from first names. */
export async function confirmAllTitlesAction(): Promise<Result<{ count: number }>> {
  const user = await requireRole("editor");
  const confirmed = await db()
    .update(members)
    .set({ titleConfirmed: true, updatedAt: new Date() })
    .where(and(eq(members.titleConfirmed, false), isNull(members.archivedAt)))
    .returning({ id: members.id });
  await audit(db(), { userId: user.id, action: "confirm_titles", entity: "member", diff: { count: confirmed.length } });
  refresh();
  return { ok: true, count: confirmed.length };
}

const Id = z.string().uuid();

/**
 * Create a private link, replacing any earlier one, or revoke it. The raw
 * token is returned once, here, and never stored (DECISIONS D7) — so the
 * link can be copied now, and "show it again" means making a new one.
 */
/**
 * A member's private link (§13): show the current one, make a new one (the
 * old stops working), or revoke it.
 */
export async function memberLinkAction(memberId: string, mode: "show" | "create" | "revoke"): Promise<Result<{ url: string | null }>> {
  const user = await requireRole("editor");
  if (!Id.safeParse(memberId).success) return { ok: false, error: "That member isn't on the list any more." };
  if (mode === "show") {
    const [row] = await db().select({ enc: members.publicTokenEnc }).from(members).where(eq(members.id, memberId));
    const token = openToken(row?.enc);
    return token ? { ok: true, url: memberUrl(token) } : { ok: false, error: "This link was made before links could be shown again. Make a new one." };
  }
  const token = mode === "create" ? newToken() : null;
  const [row] = await db()
    .update(members)
    .set({ publicTokenHash: token ? hashToken(token) : null, publicTokenEnc: token ? sealToken(token) : null, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning({ id: members.id });
  if (!row) return { ok: false, error: "That member isn't on the list any more." };
  await audit(db(), { userId: user.id, action: mode === "create" ? "link_created" : "link_revoked", entity: "member", entityId: memberId });
  refresh();
  return { ok: true, url: token ? memberUrl(token) : null };
}

/** Archived, never deleted: their past sessions are the pair history. */
export async function archiveMemberAction(memberId: string): Promise<Result> {
  const user = await requireRole("editor");
  if (!Id.safeParse(memberId).success) return { ok: false, error: "That member isn't on the list any more." };
  const [row] = await db()
    .update(members)
    .set({ archivedAt: new Date(), active: false, publicTokenHash: null, publicTokenEnc: null, updatedAt: new Date() })
    .where(eq(members.id, memberId))
    .returning({ name: members.displayName });
  if (!row) return { ok: false, error: "That member isn't on the list any more." };
  await audit(db(), { userId: user.id, action: "archive", entity: "member", entityId: memberId, diff: { displayName: row.name } });
  refresh();
  return { ok: true };
}

const Limits = z.object({
  publisher: z.number().int().min(0).max(31),
  auxiliary_pioneer: z.number().int().min(0).max(31),
  regular_pioneer: z.number().int().min(0).max(31),
});

export async function saveLimitsAction(input: z.input<typeof Limits>): Promise<Result> {
  const user = await requireRole("owner");
  const parsed = Limits.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Each limit is a whole number from 0 to 31." };
  await db()
    .insert(settings)
    .values({ id: 1, privilegeLimits: parsed.data })
    .onConflictDoUpdate({ target: settings.id, set: { privilegeLimits: parsed.data, updatedAt: sql`now()` } });
  await audit(db(), { userId: user.id, action: "update", entity: "settings", diff: { privilegeLimits: parsed.data } });
  refresh();
  return { ok: true };
}
