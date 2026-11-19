"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { transaction } from "@/db/client";
import { LayoutPatch, savePrintLayout } from "@/db/mutations/print";
import { requireRole } from "@/lib/auth/session";
import { isMonth } from "@/lib/dates/calendar";
import { firstIssue, type Result } from "@/lib/result";

const refresh = (month: string) => {
  revalidatePath(`/sheet/${month}`);
  revalidatePath(`/print/${month}`);
};

/** One change from the sheet editor: a cell's text, a width, a height, a print option. */
export async function saveLayoutAction(month: string, patch: z.input<typeof LayoutPatch>): Promise<Result> {
  const user = await requireRole("editor");
  if (!isMonth(month)) return { ok: false, error: "That month didn't look right." };
  const parsed = LayoutPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  try {
    await transaction((tx) => savePrintLayout(tx, user.id, month, parsed.data));
  } catch (error) {
    if (error instanceof Error && error.message === "NO_SCHEDULE") return { ok: false, error: "Generate the month first; then its sheet can be edited." };
    console.error(error);
    return { ok: false, error: "That didn't save. Try again in a moment." };
  }
  refresh(month);
  return { ok: true };
}
