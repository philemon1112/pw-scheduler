import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import { testDb } from "@/test/pglite";

import { applySeed } from "./seed-apply";
import { assignments, members, schedules } from "./schema";

const raw = JSON.parse(readFileSync(new URL("../../seed/pw-history-2026.json", import.meta.url), "utf8"));
const plan = planSeed(raw);

describe("applying the seed", () => {
  it("writes everything, then changes nothing on a second run", async () => {
    const { db } = await testDb();

    const first = await applySeed(db, plan, raw);
    expect(first).toMatchObject({ locations: 2, slots: 12, membersAdded: 41, couplesAdded: 6 });
    expect(first.months.map((m) => [m.month, m.action, m.sessions])).toEqual([
      ["2026-07", "imported", 48],
      ["2026-09", "imported", 48],
      ["2026-11", "imported", 48],
    ]);

    // An edit made in the app survives a second seed.
    await db.update(members).set({ title: "Sis", titleConfirmed: true, phoneE164: "+233241234567" }).where(sql`display_name = 'Julia Eshun'`);

    const second = await applySeed(db, plan, raw);
    expect(second).toMatchObject({ membersAdded: 0, couplesAdded: 0 });
    expect(second.months.every((m) => m.action === "replaced")).toBe(true);

    const counts = await db.execute<{ m: number; s: number; a: number; c: number }>(
      sql`select (select count(*) from members)::int m, (select count(*) from schedules)::int s, (select count(*) from assignments)::int a, (select count(*) from couples)::int c`
    );
    expect(counts.rows[0]).toEqual({ m: 41, s: 3, a: 144, c: 6 });
    const julia = await db.select().from(members).where(sql`display_name = 'Julia Eshun'`);
    expect(julia[0]).toMatchObject({ titleConfirmed: true, phoneE164: "+233241234567" });
  });

  it("schedules are archived imports, and couples are marked on their sessions", async () => {
    const { db } = await testDb();
    await applySeed(db, plan, raw);
    const rows = await db.select({ status: schedules.status }).from(schedules);
    expect(rows.every((r) => r.status === "archived")).toBe(true);
    const coupled = await db.select().from(assignments).where(sql`couple_id is not null`);
    // Each month seats the six couples in some sessions.
    expect(coupled.length).toBeGreaterThan(0);
  });

  it("the pair-history view sees every two-person session, with sorted ids", async () => {
    const { db } = await testDb();
    await applySeed(db, plan, raw);
    const history = await db.execute<{ n: number; unsorted: number; nov: number }>(
      sql`select count(*)::int n, count(*) filter (where member_lo > member_hi)::int unsorted, count(*) filter (where month = '2026-11')::int nov from pair_history`
    );
    expect(history.rows[0]).toEqual({ n: 144, unsorted: 0, nov: 48 });
  });

  it("leaves alone a month that has work done in the app", async () => {
    const { db } = await testDb();
    await applySeed(db, plan, raw);
    await db.execute(sql`update assignments set source = 'manual' where id = (select id from assignments limit 1)`);
    const again = await applySeed(db, plan, raw);
    expect(again.months.filter((m) => m.action === "skipped")).toHaveLength(1);
  });
});
