import { sql } from "drizzle-orm";
import { z } from "zod";

import { audit } from "../audit";
import { settings } from "../schema";
import type { AnyDb } from "../types";

export const SettingsInput = z.object({
  congregationName: z.string().trim().min(1, "Enter the congregation's name.").max(120),
  weekRule: z.enum(["calendar_week", "nth_weekday"]),
  includeFifthWeek: z.boolean(),
  repeatWindowMonths: z.number().int().min(0).max(12),
});
export type SettingsInput = z.infer<typeof SettingsInput>;

export async function saveSettings(tx: AnyDb, userId: string, input: SettingsInput) {
  await tx
    .insert(settings)
    .values({ id: 1, ...input })
    .onConflictDoUpdate({ target: settings.id, set: { ...input, updatedAt: sql`now()` } });
  await audit(tx, { userId, action: "update", entity: "settings", diff: input });
}
