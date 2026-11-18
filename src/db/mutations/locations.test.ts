import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import type { LocationInput } from "@/lib/locations/input";
import { testDb } from "@/test/pglite";

import { applySeed } from "../seed-apply";
import { locations, slots, users } from "../schema";

import { saveLocation } from "./locations";

const raw = JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8"));

async function seeded() {
  const { db } = await testDb();
  await applySeed(db, planSeed(raw), raw);
  const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
  const [mtn] = await db.select().from(locations).where(eq(locations.key, "mtn"));
  const mtnSlots = await db.select().from(slots).where(eq(slots.locationId, mtn.id));
  const asInput = (patch: Partial<LocationInput> = {}): LocationInput => ({
    id: mtn.id,
    name: mtn.name,
    messageName: mtn.messageName,
    pdfTitle: mtn.pdfTitle,
    pdfColor: mtn.pdfColor,
    active: true,
    slots: mtnSlots.map((s) => ({ id: s.id, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, pdfDayLabel: s.pdfDayLabel, pdfTimeLabel: s.pdfTimeLabel, active: s.active })),
    ...patch,
  });
  return { db, userId: user.id, mtn, mtnSlots, asInput };
}

describe("saving a location", () => {
  it("adds a slot with a seed-style key", async () => {
    const { db, userId, mtn, asInput } = await seeded();
    const input = asInput();
    input.slots.push({ id: null, weekday: "TUE", startTime: "16:00", endTime: "18:00", pdfDayLabel: "Tuesday", pdfTimeLabel: "4:00 – 6:00 pm", active: true });
    expect((await saveLocation(db, userId, input)).ok).toBe(true);
    const keys = (await db.select().from(slots).where(eq(slots.locationId, mtn.id))).map((s) => s.key);
    expect(keys).toContain("mtn-tue-1600");
  });

  it("a slot with history is switched off, not deleted, when removed", async () => {
    const { db, userId, mtnSlots, asInput } = await seeded();
    const input = asInput();
    input.slots = input.slots.slice(1);
    expect((await saveLocation(db, userId, input)).ok).toBe(true);
    const [first] = await db.select().from(slots).where(eq(slots.id, mtnSlots[0].id));
    expect(first).toMatchObject({ active: false });
  });

  it("refuses two slots at the same start on the same day", async () => {
    const { db, userId, asInput } = await seeded();
    const input = asInput();
    input.slots.push({ ...input.slots[0], id: null });
    expect(await saveLocation(db, userId, input)).toEqual({ ok: false, error: "Two slots start at the same time on the same day." });
  });

  it("creates a new location", async () => {
    const { db, userId, asInput } = await seeded();
    const result = await saveLocation(db, userId, asInput({ id: null, name: "Madina Market", messageName: "Madina Market", pdfTitle: "MADINA MARKET", slots: [{ id: null, weekday: "SAT", startTime: "07:00", endTime: "09:00", pdfDayLabel: "SATURDAY", pdfTimeLabel: "7:00 – 9:00 am", active: true }] }));
    expect(result.ok).toBe(true);
    const created = await db.select().from(locations).where(eq(locations.key, "madina-market"));
    expect(created).toHaveLength(1);
    expect(await db.select().from(slots).where(eq(slots.locationId, created[0].id))).toHaveLength(1);
  });
});
