import { describe, expect, it } from "vitest";

import { monthComparison, pairOf, pairStats } from "./history";

const s = (month: string, date: string, a: string, b: string, isCouple = false) => ({ month, date, memberIds: [a, b], isCouple });

describe("pair history", () => {
  const sessions = [s("2026-09", "2026-09-04", "x", "y"), s("2026-09", "2026-09-05", "h", "w", true), s("2026-11", "2026-11-06", "y", "x"), s("2026-11", "2026-11-07", "x", "z"), s("2026-11", "2026-11-08", "h", "w", true)];

  it("counts each pair once whichever way round they were written", () => {
    const stats = pairStats(sessions);
    expect(pairOf(stats, "y", "x")).toMatchObject({ count: 2, months: ["2026-09", "2026-11"] });
    expect(pairOf(stats, "x", "w")).toBeNull();
  });

  it("compares a month with the one before, per session, leaving couples out", () => {
    expect(monthComparison(sessions, "2026-11", "2026-09")).toMatchObject({ pairs: 2, repeated: 1 });
  });
});
