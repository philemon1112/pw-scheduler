import { describe, expect, it } from "vitest";

import { bigMonth, input, member, session } from "./fixtures";
import { evaluate, generate, isEligible, suggest, type Placement, type SchedulerInput } from "./index";

/** Every hard rule (§8), checked from the outside against a finished month. */
function hardBreaks(month: SchedulerInput, placements: Placement[]): string[] {
  const problems: string[] = [];
  const people = new Map(month.members.map((m) => [m.id, m]));
  const sessions = new Map(month.sessions.map((s) => [s.id, s]));
  const couple = (a: string, b: string) => month.couples.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
  const together = new Set(month.couples.filter((c) => c.alwaysTogether).flatMap((c) => [c.a, c.b]));
  const count = new Map<string, number>();
  const days = new Map<string, number>();
  for (const p of placements) {
    const s = sessions.get(p.sessionId)!;
    if (s.isCancelled) problems.push(`placed in cancelled ${s.id}`);
    for (const id of p.memberIds) {
      const m = people.get(id)!;
      if (!p.locked && !isEligible(m, s)) problems.push(`${id} not available for ${s.id}`);
      count.set(id, (count.get(id) ?? 0) + 1);
      days.set(`${id}@${s.date}`, (days.get(`${id}@${s.date}`) ?? 0) + 1);
    }
    if (p.memberIds.length !== 2 && !p.locked) problems.push(`${s.id} has ${p.memberIds.length} people`);
    if (p.memberIds.length === 2) {
      const [a, b] = p.memberIds;
      const isCouple = !!couple(a, b);
      if (!isCouple && people.get(a)!.gender !== people.get(b)!.gender && !p.allowMixed) problems.push(`mixed pair in ${s.id}`);
      if (!isCouple && (together.has(a) || together.has(b))) problems.push(`always-together person split in ${s.id}`);
      if (month.never.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) problems.push(`never-pair in ${s.id}`);
    }
  }
  for (const [id, n] of count) if (n > people.get(id)!.limit) problems.push(`${id} over limit (${n})`);
  for (const [key, n] of days) if (n > 1) problems.push(`${key} twice in a day`);
  return problems;
}

const weekend = (n = 4) =>
  Array.from({ length: n }, (_, w) => [
    session(`sat@w${w}`, `2026-12-${String(5 + w * 7).padStart(2, "0")}`),
    session(`sun@w${w}`, `2026-12-${String(6 + w * 7).padStart(2, "0")}`),
  ]).flat();

describe("hard constraints", () => {
  it("fills a simple month and breaks nothing", () => {
    const month = input({ sessions: weekend(), members: [..."abcdefgh"].map((id, i) => member(id, i < 4 ? "M" : "F")) });
    const result = generate(month);
    expect(result.placements).toHaveLength(8);
    expect(hardBreaks(month, result.placements)).toEqual([]);
  });

  it("puts `specific` people only in their ticked slots", () => {
    const month = input({
      sessions: weekend(2),
      members: [member("a", "M", { mode: "specific", slotIds: ["slot-sat"] }), member("b", "M", { mode: "specific", slotIds: ["slot-sat"] }), member("c", "M"), member("d", "M")],
    });
    const result = generate(month);
    for (const p of result.placements.filter((p) => p.sessionId.startsWith("sun"))) expect(p.memberIds).not.toContain("a");
    expect(hardBreaks(month, result.placements)).toEqual([]);
  });

  it("never auto-places `ask_monthly` people until they confirm the month", () => {
    const people = [member("a", "M", { mode: "ask_monthly" }), member("b", "M", { mode: "ask_monthly" })];
    const notYet = generate(input({ sessions: weekend(1), members: people }));
    expect(notYet.placements).toEqual([]);
    expect(notYet.evaluation.issues.filter((i) => i.kind === "unfilled")).toHaveLength(2);
    const confirmed = generate(input({ sessions: weekend(1), members: people.map((m) => ({ ...m, confirmedThisMonth: true })) }));
    expect(confirmed.placements).toHaveLength(2);
  });

  it("respects away dates, pauses and inactive people", () => {
    const month = input({
      sessions: weekend(2),
      members: [
        member("away", "M", { away: [{ start: "2026-12-05", end: "2026-12-06" }] }),
        member("paused", "M", { pausedUntil: "2026-12-31" }),
        member("gone", "M", { active: false }),
        member("x", "M"),
        member("y", "M"),
        member("z", "M"),
      ],
    });
    const result = generate(month);
    const used = (id: string) => result.placements.filter((p) => p.memberIds.includes(id)).map((p) => p.sessionId);
    expect(used("away").every((s) => s.endsWith("w1"))).toBe(true);
    expect(used("paused")).toEqual([]);
    expect(used("gone")).toEqual([]);
    expect(hardBreaks(month, result.placements)).toEqual([]);
  });

  it("gives nobody two sessions on one day, across locations", () => {
    const sessions = [session("a@1", "2026-12-05"), session("b@1", "2026-12-05", { locationId: "mtn" }), session("c@1", "2026-12-05")];
    const month = input({ sessions, members: [..."abcdef"].map((id) => member(id, "F", { limit: 6 })) });
    const result = generate(month);
    expect(result.placements).toHaveLength(3);
    expect(new Set(result.placements.flatMap((p) => p.memberIds)).size).toBe(6);
  });

  it("keeps everyone within their limit, leaving a session empty rather than break one", () => {
    const month = input({ sessions: weekend(2), members: [..."abc"].map((id) => member(id, "M", { limit: 2 })) });
    const result = generate(month);
    expect(hardBreaks(month, result.placements)).toEqual([]);
    expect(result.placements.length).toBeLessThan(4);
    expect(result.evaluation.issues.some((i) => i.kind === "unfilled")).toBe(true);
    expect(result.evaluation.capacity).toEqual({ needed: 8, available: 6 });
  });

  it("pairs Bro with Bro and Sis with Sis, or a couple together", () => {
    const month = input({
      sessions: weekend(2),
      members: [member("h", "M"), member("w", "F"), member("b1", "M"), member("s1", "F")],
      couples: [{ id: "c", a: "h", b: "w", alwaysTogether: false }],
    });
    const result = generate(month);
    expect(hardBreaks(month, result.placements)).toEqual([]);
    const couple = result.placements.filter((p) => p.coupleId === "c");
    expect(couple.length).toBeGreaterThan(0);
    for (const p of result.placements) if (p.memberIds.includes("b1")) expect(p.memberIds).not.toContain("s1");
  });

  it("allows a mixed pair only where it's been allowed", () => {
    const sessions = weekend(1);
    const people = [member("b", "M"), member("s", "F")];
    expect(generate(input({ sessions, members: people })).placements).toEqual([]);
    const allowed = generate(input({ sessions, members: people, placements: [{ sessionId: "sat@w0", memberIds: [], coupleId: null, locked: false, allowMixed: true }] }));
    expect(allowed.placements.map((p) => p.sessionId)).toEqual(["sat@w0"]);
  });

  it("keeps an always-together couple together", () => {
    const month = input({
      sessions: weekend(2),
      members: [member("h", "M"), member("w", "F"), member("b1", "M"), member("b2", "M"), member("s1", "F"), member("s2", "F")],
      couples: [{ id: "c", a: "h", b: "w", alwaysTogether: true }],
    });
    const result = generate(month);
    expect(hardBreaks(month, result.placements)).toEqual([]);
    for (const p of result.placements) if (p.memberIds.includes("h")) expect(p.memberIds).toContain("w");
  });

  it("never places a never-pair together", () => {
    const month = input({ sessions: weekend(2), members: [member("a", "M"), member("b", "M"), member("c", "M")], never: [["a", "b"]] });
    const result = generate(month);
    for (const p of result.placements) expect(p.memberIds.includes("a") && p.memberIds.includes("b")).toBe(false);
  });

  it("keeps locked cells exactly and counts them toward limits", () => {
    const lock: Placement = { sessionId: "sat@w0", memberIds: ["a", "b"], coupleId: null, locked: true, allowMixed: false };
    const month = input({ sessions: weekend(2), members: [..."abcdef"].map((id) => member(id, "M", { limit: 1 })), placements: [lock] });
    const result = generate(month);
    expect(result.placements).toContainEqual(lock);
    expect(result.placements.filter((p) => p.memberIds.includes("a"))).toHaveLength(1);
    expect(hardBreaks(month, result.placements)).toEqual([]);
  });

  it("never breaks a hard rule on bigger random months", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const month = { ...bigMonth(40, 36, seed), iterations: 60 };
      expect(hardBreaks(month, generate(month).placements)).toEqual([]);
    }
  });
});

describe("soft preferences", () => {
  const people = [..."abcdef"].map((id) => member(id, "M", { limit: 4 }));

  it("avoids repeating last month's pairs when it can", () => {
    const history = [
      { a: "a", b: "b", month: "2026-11", isCouple: false },
      { a: "c", b: "d", month: "2026-11", isCouple: false },
      { a: "e", b: "f", month: "2026-11", isCouple: false },
    ];
    const result = generate(input({ sessions: weekend(1), members: people, history }));
    expect(result.evaluation.repeats).toMatchObject({ lastMonth: "2026-11", repeated: 0, pairs: 2 });
  });

  it("doesn't put the same pair together twice in a month when it can avoid it", () => {
    const result = generate(input({ sessions: weekend(3), members: people }));
    expect(result.evaluation.issues.filter((i) => i.kind === "twice_this_month")).toEqual([]);
  });

  it("shares the load out fairly", () => {
    const result = generate(input({ sessions: weekend(3), members: people }));
    const counts = result.evaluation.loads.map((l) => l.count);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("explains each choice in one line", () => {
    const history = [{ a: "a", b: "b", month: "2026-07", isCouple: false }];
    const result = generate(input({ sessions: weekend(1), members: people, history, repeatWindowMonths: 3 }));
    for (const p of result.placements) expect(p.reason).toMatch(/^(First time together|Not together since Jul|Couple)( · .+ used( each)?)$/);
  });
});

describe("determinism and speed", () => {
  it("gives the same month for the same seed", () => {
    const month = bigMonth(40, 36, 11);
    const one = generate({ ...month, iterations: 80 });
    const two = generate({ ...month, iterations: 80 });
    expect(two.placements).toEqual(one.placements);
  });

  it("builds about 50 sessions for 50 people in under 2 seconds", () => {
    const result = generate(bigMonth(50, 50, 3));
    expect(result.ms).toBeLessThan(2000);
    expect(result.iterations).toBe(300);
    expect(hardBreaks(bigMonth(50, 50, 3), result.placements)).toEqual([]);
  });
});

describe("evaluate", () => {
  const people = [..."abcd"].map((id) => member(id, "F", { limit: 1 }));

  it("finds a clash made by hand: two sessions on one day, over the limit, a repeat", () => {
    const sessions = [session("x@1", "2026-12-04"), session("y@1", "2026-12-04", { locationId: "mtn" })];
    const placements: Placement[] = [
      { sessionId: "x@1", memberIds: ["a", "b"], coupleId: null, locked: false, allowMixed: false },
      { sessionId: "y@1", memberIds: ["a", "c"], coupleId: null, locked: false, allowMixed: false },
    ];
    const history = [{ a: "a", b: "b", month: "2026-11", isCouple: false }];
    const result = evaluate(input({ sessions, members: people, placements, history }));
    const kinds = result.issues.map((i) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["same_day", "over_limit", "repeat_last_month"]));
    expect(result.badges["x@1"]).toEqual(expect.arrayContaining(["repeat", "same_day", "over_limit"]));
    expect(result.repeats).toEqual({ lastMonth: "2026-11", repeated: 1, pairs: 2 });
  });

  it("flags people whose title isn't confirmed", () => {
    const sessions = [session("x@1", "2026-12-04")];
    const placements: Placement[] = [{ sessionId: "x@1", memberIds: ["a", "b"], coupleId: null, locked: false, allowMixed: false }];
    const result = evaluate(input({ sessions, members: [member("a", "F", { titleConfirmed: false }), member("b", "F")], placements }));
    expect(result.issues).toContainEqual({ kind: "title_unconfirmed", memberIds: ["a"] });
  });
});

describe("suggest", () => {
  it("offers up to three valid replacements, best first, each with a reason", () => {
    const sessions = weekend(1);
    const members = [..."abcdefg"].map((id) => member(id, "M", { limit: 2 }));
    const placements: Placement[] = [
      { sessionId: "sat@w0", memberIds: ["a", "b"], coupleId: null, locked: false, allowMixed: false },
      { sessionId: "sun@w0", memberIds: ["c", "d"], coupleId: null, locked: false, allowMixed: false },
    ];
    const history = [{ a: "a", b: "e", month: "2026-11", isCouple: false }];
    const { replace } = suggest(input({ sessions, members, placements, history }), "sat@w0");
    const forB = replace.b;
    expect(forB).toHaveLength(3);
    expect(forB.map((s) => s.memberIds[0])).not.toContain("a");
    // Nobody already in the session, and everyone free on Saturday (c and d serve Sunday, so they are).
    expect(forB.map((s) => s.memberIds[0])).not.toContain("b");
    // e served with a last month, so ranks below people who already have a session.
    expect(forB.map((s) => s.memberIds[0])).not.toContain("e");
    expect(forB.slice(0, 2).map((s) => s.memberIds[0]).sort()).toEqual(["f", "g"]);
    expect(forB[0].delta).toBeLessThanOrEqual(forB[1].delta);
    expect(forB[0].reason).toMatch(/^Free that day · 0 of 2 used · First time with a$/);
  });

  it("offers whole pairs for an empty session", () => {
    const { fill } = suggest(input({ sessions: weekend(1), members: [..."abc"].map((id) => member(id, "F")) }), "sat@w0");
    expect(fill).toHaveLength(3);
    expect(fill[0].memberIds).toHaveLength(2);
  });
});
