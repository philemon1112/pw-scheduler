import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { planSeed, type PlannedSession } from "./seed-plan";

const raw = JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8"));
const plan = planSeed(raw);
const month = (m: string) => plan.schedules.find((s) => s.month === m)!.sessions;

describe("the seed", () => {
  it("has the two locations with their 12 weekly slots", () => {
    expect(plan.locations.map((l) => [l.key, l.slots.length])).toEqual([["police", 7], ["mtn", 5]]);
  });

  it("has 41 members, the six couples, and the known alias", () => {
    expect(plan.members).toHaveLength(41);
    expect(plan.couples).toHaveLength(6);
    expect(plan.couples.map((c) => c.label)).toContain("Bro & Sis Agbanawo");
    expect(plan.members.find((m) => m.displayName === "Henry Atsu Damey")?.aliases).toEqual(["Henry Atsu Dameh"]);
    expect(plan.members.every((m) => (m.title === "Bro") === (m.gender === "M"))).toBe(true);
  });

  it("Kwabena Adusei Snr & Davida Adusei are not a couple (DECISIONS D14)", () => {
    const together = month("2026-11").filter((s) => s.members.includes("Davida Adusei") && s.members.includes("Kwabena Adusei Snr"));
    expect(together.length).toBeGreaterThan(0);
    expect(together.every((s) => !s.couple)).toBe(true);
  });

  it("imports 48 sessions a month, every one dated inside its month", () => {
    for (const schedule of plan.schedules) {
      expect(schedule.sessions).toHaveLength(48);
      expect(schedule.sessions.every((s) => s.date.startsWith(schedule.month))).toBe(true);
    }
  });

  it("dates sessions by Mon–Sun weeks", () => {
    const find = (m: string, week: number, slot: string) => month(m).find((s) => s.week === week && s.slotKey === slot)!;
    expect(find("2026-11", 2, "mtn-fri-0600").date).toBe("2026-11-13");
    expect(find("2026-11", 2, "mtn-sun-0930").date).toBe("2026-11-15");
    expect(find("2026-11", 1, "police-tue-1600").date).toBe("2026-11-03");
    expect(find("2026-09", 1, "police-tue-1600").date).toBe("2026-09-01");
  });

  it("dates July's Tuesday column 7, 14, 21, 28 — Week 1's Tuesday would be 30 June", () => {
    const tuesdays = month("2026-07").filter((s) => s.slotKey === "police-tue-1600").map((s) => [s.week, s.date]);
    expect(tuesdays).toEqual([[1, "2026-07-07"], [2, "2026-07-14"], [3, "2026-07-21"], [4, "2026-07-28"]]);
    expect(plan.notes.some((n) => n.startsWith("2026-07 police-tue-1600"))).toBe(true);
    // Every other column fits the Mon–Sun weeks and keeps its dates.
    expect(plan.notes).toHaveLength(1);
  });

  it("never puts two sessions of one slot on the same date", () => {
    for (const schedule of plan.schedules) {
      const keys = schedule.sessions.map((s) => `${s.slotKey}|${s.date}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

/* ── §9 acceptance checks, on the seeded history ───────────────────────── */

const load = (sessions: PlannedSession[]) => {
  const counts = new Map<string, number>();
  for (const s of sessions) for (const m of s.members) counts.set(m, (counts.get(m) ?? 0) + 1);
  return counts;
};
const pairKey = (s: PlannedSession) => [...s.members].sort().join(" & ");

describe("§9 acceptance", () => {
  it("Davida Adusei is booked twice on Friday of Week 4 in November", () => {
    const friday = month("2026-11").filter((s) => s.date === "2026-11-27" && s.members.includes("Davida Adusei"));
    expect(friday.map((s) => s.slotKey).sort()).toEqual(["police-fri-0600", "police-fri-1600"]);
  });

  it("Comfort Owusua has 6 sessions in November, the most of anyone", () => {
    const counts = load(month("2026-11"));
    expect(counts.get("Comfort Owusua")).toBe(6);
    expect(Math.max(...counts.values())).toBe(6);
    expect([...counts.values()].filter((n) => n === 1)).toHaveLength(12);
  });

  it("34 of the 43 November sessions with a non-couple pair repeat a September pair", () => {
    const september = new Set(month("2026-09").map(pairKey));
    const pairs = month("2026-11").filter((s) => s.members.length === 2 && !s.couple);
    expect(pairs).toHaveLength(43);
    expect(pairs.filter((s) => september.has(pairKey(s)))).toHaveLength(34);
  });
});
