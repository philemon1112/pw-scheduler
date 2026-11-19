import { eq } from "drizzle-orm";

import type { SpecialDayInput } from "@/lib/dates/special-day-input";

import { audit } from "../audit";
import { sessions, specialDayRules } from "../schema";
import type { AnyDb } from "../types";

/** Save a special day. Fields that don't apply to its kind and action are cleared. */
export async function saveSpecialDay(tx: AnyDb, userId: string, input: SpecialDayInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const recurring = input.kind === "recurring";
  const needsTimes = input.action === "change_time" || input.action === "add_session";
  const values = {
    name: input.name,
    kind: input.kind,
    recurrence: recurring ? { type: "nth_weekday" as const, n: input.recurrenceN, weekday: input.recurrenceWeekday } : null,
    date: recurring ? null : input.date,
    endDate: recurring || !input.endDate || input.endDate === input.date ? null : input.endDate,
    locationIds: input.locationIds.length > 0 ? input.locationIds : null,
    slotIds: !recurring && input.action !== "add_session" && input.slotIds.length > 0 ? input.slotIds : null,
    action: input.action,
    cutoffTime: recurring ? input.cutoffTime : null,
    newStartTime: needsTimes ? input.newStartTime : null,
    newEndTime: needsTimes ? input.newEndTime : null,
    noteForMessages: input.noteForMessages || null,
    noteForPdf: input.noteForPdf || null,
    active: input.active,
  };

  if (input.id) {
    const [row] = await tx.update(specialDayRules).set({ ...values, updatedAt: new Date() }).where(eq(specialDayRules.id, input.id)).returning({ id: specialDayRules.id });
    if (!row) return { ok: false, error: "That special day isn't there any more." };
    await audit(tx, { userId, action: "update", entity: "special_day", entityId: row.id, diff: values });
    return { ok: true, id: row.id };
  }
  const [row] = await tx.insert(specialDayRules).values(values).returning({ id: specialDayRules.id });
  await audit(tx, { userId, action: "create", entity: "special_day", entityId: row.id, diff: values });
  return { ok: true, id: row.id };
}

/**
 * Delete a special day. Sessions already made under it keep their adjusted
 * times — they are what was published — and just stop naming the rule.
 */
export async function deleteSpecialDay(tx: AnyDb, userId: string, id: string): Promise<boolean> {
  await tx.update(sessions).set({ specialDayRuleId: null }).where(eq(sessions.specialDayRuleId, id));
  const removed = await tx.delete(specialDayRules).where(eq(specialDayRules.id, id)).returning({ name: specialDayRules.name });
  if (removed.length > 0) await audit(tx, { userId, action: "delete", entity: "special_day", entityId: id, diff: { name: removed[0].name } });
  return removed.length > 0;
}
