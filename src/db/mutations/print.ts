import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { audit } from "../audit";
import { printLayouts, schedules } from "../schema";
import type { AnyDb } from "../types";

const Ref = z.string().regex(/^[A-Z]{1,2}[1-9]\d{0,2}$/, "That cell didn't look right.");

/** One change from the sheet editor. Only what is sent is changed. */
export const LayoutPatch = z.object({
  columnWidths: z.record(z.string().regex(/^[A-Z]{1,2}$/), z.number().int().min(24).max(600)).optional(),
  rowHeights: z.record(z.string().regex(/^[1-9]\d{0,2}$/), z.number().int().min(8).max(400)).optional(),
  /** Text per cell; null removes the override ("Reset cell"). */
  cells: z.record(Ref, z.string().max(500).nullable()).optional(),
  orientation: z.enum(["landscape", "portrait"]).optional(),
  margins: z.enum(["normal", "narrow"]).optional(),
  fitToWidth: z.boolean().optional(),
  fontSize: z.number().int().min(8).max(14).optional(),
});
export type LayoutPatch = z.infer<typeof LayoutPatch>;

/**
 * Saves editor changes for a month's sheet. Typed text lives only here, in
 * `cell_overrides` — the real pairs, the builder and the messages never see
 * it (§11).
 */
export async function savePrintLayout(tx: AnyDb, userId: string, month: string, patch: LayoutPatch) {
  const [schedule] = await tx.select({ id: schedules.id }).from(schedules).where(eq(schedules.month, month)).limit(1);
  if (!schedule) throw new Error("NO_SCHEDULE");

  const [existing] = await tx.select().from(printLayouts).where(eq(printLayouts.scheduleId, schedule.id)).limit(1);
  const overrides = { ...(existing?.cellOverrides ?? {}) };
  for (const [ref, text] of Object.entries(patch.cells ?? {})) {
    if (text === null) delete overrides[ref];
    else overrides[ref] = text;
  }
  const values = {
    columnWidths: { ...(existing?.columnWidths ?? {}), ...(patch.columnWidths ?? {}) },
    rowHeights: { ...(existing?.rowHeights ?? {}), ...(patch.rowHeights ?? {}) },
    cellOverrides: overrides,
    ...(patch.orientation ? { orientation: patch.orientation } : {}),
    ...(patch.margins ? { margins: patch.margins } : {}),
    ...(patch.fitToWidth !== undefined ? { fitToWidth: patch.fitToWidth } : {}),
    ...(patch.fontSize ? { fontSize: patch.fontSize } : {}),
  };
  if (existing) await tx.update(printLayouts).set({ ...values, updatedAt: sql`now()` }).where(eq(printLayouts.id, existing.id));
  else await tx.insert(printLayouts).values({ scheduleId: schedule.id, ...values });
  if (patch.cells) await audit(tx, { userId, action: "update", entity: "print_layout", entityId: schedule.id, diff: { cells: Object.keys(patch.cells) } });
}
