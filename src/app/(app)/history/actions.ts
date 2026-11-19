"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { transaction } from "@/db/client";
import { CommitInput, commitImport, ImportError, previewImport, type ImportPreview } from "@/db/mutations/import";
import { requireRole } from "@/lib/auth/session";
import { isMonth } from "@/lib/dates/calendar";
import { parseSheet } from "@/lib/import/sheet-parse";
import { readXlsxGrid } from "@/lib/import/xlsx-grid";
import type { Result } from "@/lib/result";

const MAX_BYTES = 1_000_000;

/** Step 1: read the uploaded sheet and suggest matches. The file itself isn't kept. */
export async function previewImportAction(form: FormData): Promise<Result<{ preview: ImportPreview }>> {
  const user = await requireRole("editor");
  const file = form.get("file");
  const month = String(form.get("month") ?? "");
  if (!isMonth(month)) return { ok: false, error: "Choose which month the sheet is for." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an .xlsx file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "That file is larger than 1 MB. Is it the right one?" };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, error: "Only .xlsx files can be read. In Excel, use Save As → Excel Workbook." };
  try {
    const tables = parseSheet(await readXlsxGrid(await file.arrayBuffer()));
    const preview = await transaction((tx) => previewImport(tx, user.id, { filename: file.name.slice(0, 200), month, tables }));
    return { ok: true, preview };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message };
    console.error("import preview failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "That file couldn't be read. Make sure it's an .xlsx laid out like the printed sheet." };
  }
}

/** Step 2: import the month as decided in the review. */
export async function commitImportAction(input: z.input<typeof CommitInput>): Promise<Result<{ sessions: number; membersCreated: number; skipped: number }>> {
  const user = await requireRole("editor");
  const parsed = CommitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something in the review didn't look right." };
  try {
    const result = await transaction((tx) => commitImport(tx, user.id, parsed.data));
    revalidatePath("/history");
    revalidatePath("/schedule", "layout");
    revalidatePath("/members");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message };
    console.error("import failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "The import didn't go through. Nothing was changed." };
  }
}
