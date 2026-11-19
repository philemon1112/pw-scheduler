import { describe, expect, it } from "vitest";

import { resolveMonthSessions, type SlotDef } from "@/lib/dates/sessions";
import { NATIONAL_SANITATION_DAY, type SpecialDayRule } from "@/lib/dates/special-days";

import { buildGrids, fromResolved, monthCounts, monthSpecials, type ViewLocation } from "./month-view";

const police: ViewLocation = {
  id: "police",
  key: "police",
  name: "Police Station",
  pdfColor: "#B4E0A3",
  slots: [
    { id: "p-sat-6", weekday: "SAT", startTime: "06:00", endTime: "08:00", active: true, sortOrder: 2 },
    { id: "p-tue-6", weekday: "TUE", startTime: "06:00", endTime: "08:00", active: true, sortOrder: 1 },
    { id: "p-sat-8", weekday: "SAT", startTime: "08:00", endTime: "10:00", active: true, sortOrder: 3 },
    { id: "p-sat-9", weekday: "SAT", startTime: "09:00", endTime: "11:00", active: true, sortOrder: 4 },
    { id: "p-old", weekday: "WED", startTime: "06:00", endTime: "08:00", active: false, sortOrder: 5 },
  ],
};

const slots: SlotDef[] = police.slots.map((s) => ({ ...s, locationId: "police" }));
const sanitation: SpecialDayRule = { ...NATIONAL_SANITATION_DAY, id: "nsd", active: true, recurrence: NATIONAL_SANITATION_DAY.recurrence, locationIds: null, slotIds: null } as SpecialDayRule;
const settings = { weekRule: "calendar_week" as const, includeFifthWeek: true };

describe("buildGrids", () => {
  const sessions = resolveMonthSessions("2026-11", slots, [sanitation], settings).map(fromResolved);
  const [grid] = buildGrids([police], sessions);

  it("orders columns by weekday then time, and leaves out switched-off slots with nothing in them", () => {
    expect(grid.columns.map((c) => c.slotId)).toEqual(["p-tue-6", "p-sat-6", "p-sat-8", "p-sat-9"]);
  });

  it("has one row per week, each cell in its slot's column", () => {
    expect(grid.weeks.map((w) => w.index)).toEqual([1, 2, 3, 4]);
    const week1 = grid.weeks[0];
    expect(week1.from).toBe("2026-11-03");
    expect(week1.to).toBe("2026-11-07");
    expect(week1.cells.map((c) => c?.date)).toEqual(["2026-11-03", "2026-11-07", "2026-11-07", "2026-11-07"]);
  });

  it("shows Sanitation Day on the 1st Saturday only", () => {
    const week1 = grid.weeks[0].cells;
    expect(week1[1]?.isCancelled).toBe(true);
    expect(week1[2]?.isCancelled).toBe(true);
    expect(week1[3]).toMatchObject({ change: "moved", startTime: "10:00", originalStart: "09:00" });
    expect(grid.weeks[1].cells.every((c) => c?.change === "none")).toBe(true);
  });

  it("keeps a switched-off slot's column when an old month used it", () => {
    const old = { ...sessions[0], key: "old", slotId: "p-old", date: "2026-11-04", weekIndex: 1 };
    const [withOld] = buildGrids([police], [...sessions, old]);
    expect(withOld.columns.map((c) => c.slotId)).toContain("p-old");
  });

  it("puts sessions with no slot in the week's extras", () => {
    const extra = { ...sessions[0], key: "x", slotId: null, change: "added" as const, date: "2026-11-21", weekIndex: 3 };
    const [withExtra] = buildGrids([police], [...sessions, extra]);
    expect(withExtra.weeks[2].extras.map((e) => e.key)).toEqual(["x"]);
  });
});

describe("month summary", () => {
  const sessions = resolveMonthSessions("2026-11", slots, [sanitation], settings).map(fromResolved);

  it("lists each special day once, with its dates", () => {
    expect(monthSpecials(sessions)).toEqual([{ name: "National Sanitation Day", dates: ["2026-11-07"], note: expect.any(String) }]);
  });

  it("counts sessions after special days", () => {
    // 4 Tuesdays + 4 weeks × 3 Saturday slots, less the 2 cancelled.
    expect(monthCounts(sessions)).toEqual({ sessions: 14, filled: 0, cancelled: 2, moved: 1 });
  });
});
