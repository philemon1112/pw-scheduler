"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { audit } from "@/db/audit";
import { db, transaction } from "@/db/client";
import { deleteSpecialDay, saveSpecialDay } from "@/db/mutations/special-days";
import { specialDayRules } from "@/db/schema";
import { requireRole } from "@/lib/auth/session";
import { SpecialDayInput } from "@/lib/dates/special-day-input";
import { firstIssue, type Result } from "@/lib/result";

const refresh = () => {
  revalidatePath("/locations");
  revalidatePath("/schedule", "layout");
};
const Id = z.string().uuid();

export async function saveSpecialDayAction(input: z.input<typeof SpecialDayInput>): Promise<Result<{ id: string }>> {
  const user = await requireRole("editor");
  const parsed = SpecialDayInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await transaction((tx) => saveSpecialDay(tx, user.id, parsed.data));
  if (result.ok) refresh();
  return result;
}

export async function setSpecialDayActiveAction(id: string, active: boolean): Promise<Result> {
  const user = await requireRole("editor");
  if (!Id.safeParse(id).success) return { ok: false, error: "That special day isn't there any more." };
  const [row] = await db().update(specialDayRules).set({ active, updatedAt: new Date() }).where(eq(specialDayRules.id, id)).returning({ id: specialDayRules.id });
  if (!row) return { ok: false, error: "That special day isn't there any more." };
  await audit(db(), { userId: user.id, action: active ? "activate" : "deactivate", entity: "special_day", entityId: id });
  refresh();
  return { ok: true };
}

export async function deleteSpecialDayAction(id: string): Promise<Result> {
  const user = await requireRole("editor");
  if (!Id.safeParse(id).success) return { ok: false, error: "That special day isn't there any more." };
  const removed = await transaction((tx) => deleteSpecialDay(tx, user.id, id));
  if (!removed) return { ok: false, error: "That special day isn't there any more." };
  refresh();
  return { ok: true };
}
