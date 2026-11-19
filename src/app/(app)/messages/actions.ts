"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { audit } from "@/db/audit";
import { db } from "@/db/client";
import { members, messageLog, messageTemplates, schedules, settings } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import { isMonth } from "@/lib/dates/calendar";
import type { Result } from "@/lib/result";
import { hashToken, newToken, sealToken } from "@/lib/tokens";

/**
 * Messages (§12). Nothing is sent from here — Lemon taps Send in WhatsApp
 * himself (§17). These actions keep the wording, the log of what was sent,
 * and the order locations appear in the weekend message.
 */

const Kind = z.enum(["weekend_group", "monthly_preview", "pair_reminder", "swap_offer"]);
const Uuid = z.string().uuid();
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const refresh = () => revalidatePath("/messages");

export async function saveTemplateAction(kind: string, body: string): Promise<Result> {
  const user = await requireRole("editor");
  const parsed = z.object({ kind: Kind, body: z.string().trim().min(1, "The message can't be empty.").max(4000) }).safeParse({ kind, body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That didn't look right." };
  await db()
    .insert(messageTemplates)
    .values({ kind: parsed.data.kind, body: parsed.data.body, updatedBy: user.id })
    .onConflictDoUpdate({ target: messageTemplates.kind, set: { body: parsed.data.body, updatedBy: user.id, updatedAt: sql`now()` } });
  await audit(db(), { userId: user.id, action: "update", entity: "message_template", entityId: null, diff: { kind } });
  refresh();
  return { ok: true };
}

export async function resetTemplateAction(kind: string): Promise<Result> {
  const user = await requireRole("editor");
  const parsed = Kind.safeParse(kind);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };
  await db().delete(messageTemplates).where(eq(messageTemplates.kind, parsed.data));
  await audit(db(), { userId: user.id, action: "reset", entity: "message_template", diff: { kind } });
  refresh();
  return { ok: true };
}

const LogInput = z.object({
  kind: Kind,
  memberId: Uuid.nullable(),
  month: z.string().refine(isMonth).nullable(),
  weekStart: Day.nullable(),
  text: z.string().max(8000),
  status: z.enum(["sent", "change_requested"]),
});

/** "Sent" or "Change requested", kept with the text as it was sent. */
export async function logMessageAction(input: z.input<typeof LogInput>): Promise<Result> {
  await requireRole("editor");
  const parsed = LogInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };
  const { kind, memberId, month, weekStart, text, status } = parsed.data;
  const [schedule] = month ? await db().select({ id: schedules.id }).from(schedules).where(eq(schedules.month, month)).limit(1) : [];
  await db().insert(messageLog).values({ kind, memberId, scheduleId: schedule?.id ?? null, weekStart, renderedText: text, status });
  refresh();
  return { ok: true };
}

/** The order locations appear in the weekend group message. */
export async function saveMessageOrderAction(locationIds: string[]): Promise<Result> {
  const user = await requireRole("editor");
  const parsed = z.array(Uuid).max(20).safeParse(locationIds);
  if (!parsed.success) return { ok: false, error: "That didn't look right." };
  await db().insert(settings).values({ id: 1, messageLocationOrder: parsed.data }).onConflictDoUpdate({ target: settings.id, set: { messageLocationOrder: parsed.data, updatedAt: sql`now()` } });
  await audit(db(), { userId: user.id, action: "update", entity: "settings", diff: { messageLocationOrder: parsed.data } });
  refresh();
  return { ok: true };
}

/** Private links for everyone listed who doesn't have one that can be shown (§13). */
export async function makeMissingLinksAction(memberIds: string[]): Promise<Result<{ made: number }>> {
  const user = await requireRole("editor");
  const parsed = z.array(Uuid).max(500).safeParse(memberIds);
  if (!parsed.success || parsed.data.length === 0) return { ok: true, made: 0 };
  const missing = await db()
    .select({ id: members.id })
    .from(members)
    .where(and(inArray(members.id, parsed.data), isNull(members.archivedAt), or(isNull(members.publicTokenEnc), isNull(members.publicTokenHash))));
  for (const { id } of missing) {
    const token = newToken();
    await db().update(members).set({ publicTokenHash: hashToken(token), publicTokenEnc: sealToken(token), updatedAt: new Date() }).where(eq(members.id, id));
  }
  if (missing.length) await audit(db(), { userId: user.id, action: "link_created", entity: "member", diff: { count: missing.length } });
  refresh();
  revalidatePath("/members");
  return { ok: true, made: missing.length };
}
