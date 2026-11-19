import { readFileSync } from "node:fs";

import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import { evaluate } from "@/lib/scheduler/evaluate";
import { testDb } from "@/test/pglite";

import { loadMonthInput } from "../scheduler-input";
import { applySeed } from "../seed-apply";
import { assignments, members, schedules, sessions, settings, specialDayRules, users } from "../schema";

import { generateMonth, ScheduleError, setCell, setLocked, setScheduleStatus, swapCells } from "./schedule";

const raw = JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8"));

async function seeded() {
  const { db } = await testDb();
  await applySeed(db, planSeed(raw), raw);
  const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
  return { db, userId: user.id };
}

/** December's assignments only — the seeded months have their own. */
const december = (db: Awaited<ReturnType<typeof seeded>>["db"]) =>
  db
    .select({ assignment: assignments, date: sessions.date })
    .from(assignments)
    .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
    .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
    .where(eq(schedules.month, "2026-12"))
    .orderBy(sessions.date, sessions.startTime);

const nameOf = async (db: Awaited<ReturnType<typeof seeded>>["db"]) => new Map((await db.select().from(members)).map((m) => [m.id, m.displayName]));

describe("the §9 acceptance checks, through the builder's own evaluation", () => {
  it("finds Davida twice on Fri 27 Nov, Comfort's 6 sessions, and 34 of 43 pairs repeating September", async () => {
    const { db } = await seeded();
    const names = await nameOf(db);
    const { input, schedule } = await loadMonthInput(db, "2026-11");
    expect(schedule?.status).toBe("archived");
    const result = evaluate(input);

    const clashes = result.issues.filter((i) => i.kind === "same_day").map((i) => i.kind === "same_day" && `${names.get(i.memberId)} ${i.date}`);
    expect(clashes).toContain("Davida Adusei 2026-11-27");
    const comfort = result.loads.find((l) => names.get(l.memberId) === "Comfort Owusua");
    expect(comfort?.count).toBe(6);
    expect(Math.max(...result.loads.map((l) => l.count))).toBe(6);
    expect(result.repeats).toEqual({ lastMonth: "2026-09", repeated: 34, pairs: 43 });
  });
});

describe("generating a month", () => {
  it("builds December from the seed without breaking a hard rule, and says what it couldn't fill", async () => {
    const { db, userId } = await seeded();
    const summary = await generateMonth(db, userId, "2026-12", 42);
    const hard = summary.evaluation.issues.filter((i) => ["over_limit", "same_day", "unavailable", "mixed_pair", "never_pair"].includes(i.kind));
    expect(hard).toEqual([]);
    expect(summary.ms).toBeLessThan(2000);
    // Everyone is a publisher with a limit of 2 until privileges are set: 41 × 2 places can't cover the month.
    const { needed, available } = summary.evaluation.capacity;
    expect(available).toBeLessThan(needed);
    expect(summary.unfilled).toBeGreaterThan(0);
    expect(summary.placed * 2).toBeLessThanOrEqual(available);
  });

  it("avoids November's pairs entirely when the limits allow a full month", async () => {
    const { db, userId } = await seeded();
    await db.update(settings).set({ privilegeLimits: { publisher: 4, auxiliary_pioneer: 4, regular_pioneer: 6 } }).where(eq(settings.id, 1));
    const summary = await generateMonth(db, userId, "2026-12", 7);
    expect(summary.unfilled).toBe(0);
    expect(summary.evaluation.repeats.lastMonth).toBe("2026-11");
    expect(summary.evaluation.repeats.repeated).toBe(0);
    expect(summary.evaluation.issues.filter((i) => i.kind === "twice_this_month")).toEqual([]);
  });

  it("gives the same month for the same seed", async () => {
    const { db, userId } = await seeded();
    const snapshot = async () =>
      (await db.select({ s: sessions.date, t: sessions.startTime, l: sessions.locationId, m: assignments.memberIds }).from(assignments).innerJoin(sessions, eq(sessions.id, assignments.sessionId)))
        .map((r) => `${r.s} ${r.t} ${r.l} ${[...r.m].sort().join("+")}`)
        .sort();
    await generateMonth(db, userId, "2026-12", 5);
    const first = await snapshot();
    await generateMonth(db, userId, "2026-12", 99);
    await generateMonth(db, userId, "2026-12", 5);
    expect(await snapshot()).toEqual(first);
  });

  it("keeps a locked pair exactly through Regenerate unlocked", async () => {
    const { db, userId } = await seeded();
    await generateMonth(db, userId, "2026-12", 1);
    const [{ assignment: first }] = await december(db);
    await setLocked(db, userId, first.sessionId, true);
    await generateMonth(db, userId, "2026-12", 2);
    const [after] = await db.select().from(assignments).where(eq(assignments.sessionId, first.sessionId));
    expect(after).toMatchObject({ id: first.id, memberIds: first.memberIds, locked: true });
  });

  it("follows a special day added after generating: the session is cancelled and its pair cleared", async () => {
    const { db, userId } = await seeded();
    await generateMonth(db, userId, "2026-12", 1);
    await db.insert(specialDayRules).values({ name: "Assembly", kind: "one_off", date: "2026-12-12", endDate: "2026-12-13", action: "cancel", active: true });
    await generateMonth(db, userId, "2026-12", 1);
    const weekend = await db
      .select({ cancelled: sessions.isCancelled, people: assignments.memberIds })
      .from(sessions)
      .leftJoin(assignments, eq(assignments.sessionId, sessions.id))
      .where(and(sql`${sessions.date} in ('2026-12-12', '2026-12-13')`));
    expect(weekend.length).toBeGreaterThan(0);
    expect(weekend.every((s) => s.cancelled && s.people === null)).toBe(true);
  });

  it("won't rebuild a past or a published month", async () => {
    const { db, userId } = await seeded();
    await expect(generateMonth(db, userId, "2026-11", 1)).rejects.toThrow(ScheduleError);
    await generateMonth(db, userId, "2026-12", 1);
    await setScheduleStatus(db, userId, "2026-12", "published");
    await expect(generateMonth(db, userId, "2026-12", 1)).rejects.toThrow(/back to draft/);
    await setScheduleStatus(db, userId, "2026-12", "draft");
    await expect(generateMonth(db, userId, "2026-12", 2)).resolves.toBeTruthy();
  });

  it("counts a published month as history for the next one", async () => {
    const { db, userId } = await seeded();
    await generateMonth(db, userId, "2026-12", 1);
    await setScheduleStatus(db, userId, "2026-12", "published");
    const { input } = await loadMonthInput(db, "2027-01");
    expect(input.history.some((h) => h.month === "2026-12")).toBe(true);
  });
});

describe("hand edits", () => {
  it("sets, swaps and clears cells, and the evaluation sees the result", async () => {
    const { db, userId } = await seeded();
    await generateMonth(db, userId, "2026-12", 3);
    const rows = (await december(db)).map((r) => ({ id: r.assignment.sessionId, date: r.date, people: r.assignment.memberIds }));
    const [a, b] = rows.filter((r, i) => i === 0 || r.date !== rows[0].date).slice(0, 2);

    await swapCells(db, userId, a.id, b.id);
    const [nowA] = await db.select().from(assignments).where(eq(assignments.sessionId, a.id));
    const [nowB] = await db.select().from(assignments).where(eq(assignments.sessionId, b.id));
    expect(nowA.memberIds).toEqual(b.people);
    expect(nowB.memberIds).toEqual(a.people);
    expect(nowA.source).toBe("manual");

    // Put B's people into A as well: the same people twice in a day if they share a date, or over a limit — the evaluation flags it.
    await setCell(db, userId, a.id, [nowB.memberIds[0]]);
    const { input } = await loadMonthInput(db, "2026-12");
    expect(evaluate(input).issues.some((i) => i.kind === "half_filled" && i.sessionId === a.id)).toBe(true);

    await setCell(db, userId, a.id, []);
    expect(await db.select().from(assignments).where(eq(assignments.sessionId, a.id))).toEqual([]);
  });

  it("refuses edits to a locked cell or a past month", async () => {
    const { db, userId } = await seeded();
    await generateMonth(db, userId, "2026-12", 3);
    const [{ assignment: first }] = await december(db);
    await setLocked(db, userId, first.sessionId, true);
    await expect(setCell(db, userId, first.sessionId, [])).rejects.toThrow(/Unlock/);

    const [past] = await db.select({ id: sessions.id }).from(sessions).innerJoin(schedules, eq(schedules.id, sessions.scheduleId)).where(eq(schedules.month, "2026-11")).limit(1);
    await expect(setCell(db, userId, past.id, [])).rejects.toThrow(/Past months/);
  });
});
