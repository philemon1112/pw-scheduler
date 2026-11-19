"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { transaction } from "@/db/client";
import { saveSettings, SettingsInput } from "@/db/mutations/settings";
import { requireRole } from "@/lib/auth/session";
import { firstIssue, type Result } from "@/lib/result";

/** Settings are the owner's (§2): editors can see them, not change them. */
export async function saveSettingsAction(input: z.input<typeof SettingsInput>): Promise<Result> {
  const user = await requireRole("owner");
  const parsed = SettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await transaction((tx) => saveSettings(tx, user.id, parsed.data));
  revalidatePath("/", "layout");
  return { ok: true };
}
