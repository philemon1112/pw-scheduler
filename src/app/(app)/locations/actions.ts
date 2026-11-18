"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { transaction } from "@/db/client";
import { saveLocation } from "@/db/mutations/locations";
import { requireRole } from "@/lib/auth/session";
import { LocationInput } from "@/lib/locations/input";
import { firstIssue, type Result } from "@/lib/result";

export async function saveLocationAction(input: z.input<typeof LocationInput>): Promise<Result<{ id: string }>> {
  const user = await requireRole("editor");
  const parsed = LocationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const result = await transaction((tx) => saveLocation(tx, user.id, parsed.data));
  if (result.ok) {
    revalidatePath("/locations");
    revalidatePath("/members");
  }
  return result;
}
