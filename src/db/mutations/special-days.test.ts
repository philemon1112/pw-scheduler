import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { SpecialDayInput } from "@/lib/dates/special-day-input";
import { planSeed } from "@/lib/import/seed-plan";
import { testDb } from "@/test/pglite";

import { applySeed } from "../seed-apply";
import { settings, specialDayRules, users } from "../schema";

import { saveSettings } from "./settings";
import { deleteSpecialDay, saveSpecialDay } from "./special-days";

const raw = JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8"));

async function seeded() {
  const { db } = await testDb();
  const report = await applySeed(db, planSeed(raw), raw);
  const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
  return { db, userId: user.id, report };
}

const oneOff = {
  id: null,
  name: "Circuit assembly",
  kind: "one_off" as const,
  recurrenceN: 1,
  recurrenceWeekday: "SAT" as const,
  date: "2026-12-12",
  endDate: "2026-12-13",
  locationIds: [],
  slotIds: [],
  action: "cancel" as const,
  cutoffTime: null,
  newStartTime: null,
  newEndTime: null,
  noteForMessages: "No witnessing this weekend.",
  noteForPdf: "Circuit assembly",
  active: true,
};

describe("special days in the database", () => {
  it("the seed adds Sanitation Day once, with §7's defaults", async () => {
    const { db, report } = await seeded();
    expect(report.specialDaysAdded).toBe(1);
    const again = await applySeed(db, planSeed(raw), raw);
    expect(again.specialDaysAdded).toBe(0);
    const rules = await db.select().from(specialDayRules);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ kind: "recurring", action: "off_before_cutoff_shift_overlap", recurrence: { n: 1, weekday: "SAT" }, active: true });
    expect(rules[0].cutoffTime?.slice(0, 5)).toBe("10:00");
  });

  it("saves a one-off day, clearing fields that don't apply", async () => {
    const { db, userId } = await seeded();
    const result = await saveSpecialDay(db, userId, SpecialDayInput.parse({ ...oneOff, cutoffTime: "10:00", newStartTime: "09:00", newEndTime: "11:00" }));
    expect(result.ok).toBe(true);
    const [row] = await db.select().from(specialDayRules).where(eq(specialDayRules.name, "Circuit assembly"));
    expect(row).toMatchObject({ date: "2026-12-12", endDate: "2026-12-13", cutoffTime: null, newStartTime: null, recurrence: null, locationIds: null });
  });

  it("deletes a day and leaves sessions that used it alone", async () => {
    const { db, userId } = await seeded();
    const saved = await saveSpecialDay(db, userId, SpecialDayInput.parse(oneOff));
    if (!saved.ok) throw new Error(saved.error);
    await db.execute(sql`update sessions set special_day_rule_id = ${saved.id} where id = (select id from sessions limit 1)`);
    expect(await deleteSpecialDay(db, userId, saved.id)).toBe(true);
    const linked = await db.execute<{ n: number }>(sql`select count(*)::int n from sessions where special_day_rule_id is not null`);
    expect(linked.rows[0].n).toBe(0);
  });

  it("validates what a day needs", () => {
    expect(SpecialDayInput.safeParse({ ...oneOff, date: null }).success).toBe(false);
    expect(SpecialDayInput.safeParse({ ...oneOff, endDate: "2026-12-01" }).success).toBe(false);
    expect(SpecialDayInput.safeParse({ ...oneOff, action: "add_session", newStartTime: "16:00", newEndTime: "18:00" }).success).toBe(false); // no location
    expect(SpecialDayInput.safeParse({ ...oneOff, action: "change_time", newStartTime: "16:00", newEndTime: "15:00" }).success).toBe(false);
    expect(SpecialDayInput.safeParse({ ...oneOff, kind: "recurring", action: "cancel" }).success).toBe(false);
    expect(SpecialDayInput.safeParse({ ...oneOff, kind: "recurring", action: "shift_all_to_cutoff", cutoffTime: null }).success).toBe(false);
    expect(SpecialDayInput.safeParse({ ...oneOff, kind: "recurring", action: "cancel_matching_slots" }).success).toBe(true);
  });

  it("saves the settings row", async () => {
    const { db, userId } = await seeded();
    await saveSettings(db, userId, { congregationName: "Westlands English Congregation", weekRule: "nth_weekday", includeFifthWeek: false, repeatWindowMonths: 2 });
    const [row] = await db.select().from(settings);
    expect(row).toMatchObject({ weekRule: "nth_weekday", includeFifthWeek: false, repeatWindowMonths: 2 });
  });
});
