import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import { testDb } from "@/test/pglite";

import { applySeed } from "../seed-apply";
import { assignments, printLayouts, users } from "../schema";

import { LayoutPatch, savePrintLayout } from "./print";

const raw = JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8"));

describe("saving the sheet layout", () => {
  it("merges typed cells, widths and print options, removes a reset cell, and never touches the pairs", async () => {
    const { db } = await testDb();
    await applySeed(db, planSeed(raw), raw);
    const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
    const before = await db.select().from(assignments);

    await savePrintLayout(db, user.id, "2026-11", { cells: { B7: "Typed\nby hand", C7: "Another" }, columnWidths: { B: 150 } });
    await savePrintLayout(db, user.id, "2026-11", { cells: { C7: null }, rowHeights: { "7": 60 }, orientation: "portrait", fitToWidth: false });

    const [layout] = await db.select().from(printLayouts);
    expect(layout).toMatchObject({
      cellOverrides: { B7: "Typed\nby hand" },
      columnWidths: { B: 150 },
      rowHeights: { "7": 60 },
      orientation: "portrait",
      margins: "normal",
      fitToWidth: false,
    });
    expect(await db.select().from(assignments)).toEqual(before);
  });

  it("refuses a month that hasn't been generated", async () => {
    const { db } = await testDb();
    const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
    await expect(savePrintLayout(db, user.id, "2027-01", { cells: { A1: "x" } })).rejects.toThrow("NO_SCHEDULE");
    expect(await db.select().from(printLayouts).where(eq(printLayouts.fontSize, 11))).toEqual([]);
  });

  it("rejects refs, widths and text that don't fit", () => {
    expect(LayoutPatch.safeParse({ cells: { "B0": "x" } }).success).toBe(false);
    expect(LayoutPatch.safeParse({ cells: { "b7": "x" } }).success).toBe(false);
    expect(LayoutPatch.safeParse({ columnWidths: { B: 5000 } }).success).toBe(false);
    expect(LayoutPatch.safeParse({ cells: { B7: "x".repeat(501) } }).success).toBe(false);
    expect(LayoutPatch.safeParse({ cells: { B7: null }, fontSize: 11 }).success).toBe(true);
  });
});
