import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";

import { weekdayOf } from "./calendar";
import { nextOccurrence, overlapping, resolveMonthSessions, type SlotDef } from "./sessions";
import { NATIONAL_SANITATION_DAY, type SpecialDayRule } from "./special-days";
import { formatTimeRange } from "./time";

const plan = planSeed(JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8")));
// The real slots, with their keys standing in for ids.
const slots: SlotDef[] = plan.locations.flatMap((location) =>
  location.slots.map((slot, i) => ({ id: slot.key, locationId: location.key, weekday: slot.weekday, startTime: slot.start, endTime: slot.end, active: true, sortOrder: i }))
);
const sanitation: SpecialDayRule = { ...NATIONAL_SANITATION_DAY, id: "sanitation" };
const settings = { weekRule: "calendar_week" as const, includeFifthWeek: true };
const at = (sessions: ReturnType<typeof resolveMonthSessions>, key: string, date: string) => sessions.find((s) => s.slotId === key && s.date === date)!;

describe("November 2026 (starts on a Sunday)", () => {
  const nov = resolveMonthSessions("2026-11", slots, [sanitation], settings);

  it("has four Mon–Sun weeks of the twelve slots: 48 sessions", () => {
    expect(nov).toHaveLength(48);
    expect(new Set(nov.map((s) => s.weekIndex))).toEqual(new Set([1, 2, 3, 4]));
    expect(nov.every((s) => weekdayOf(s.date) === slots.find((slot) => slot.id === s.slotId)!.weekday)).toBe(true);
  });

  it("Sunday 1 November belongs to October's last week and has no session", () => {
    expect(nov.some((s) => s.date === "2026-11-01")).toBe(false);
    expect(nov.filter((s) => s.weekIndex === 1).map((s) => s.date).sort()[0]).toBe("2026-11-03");
  });

  it("Sanitation Day on Sat 7 Nov gives exactly §7's result", () => {
    const sat = nov.filter((s) => s.date === "2026-11-07");
    const result = Object.fromEntries(sat.map((s) => [s.slotId, s.isCancelled ? "off" : formatTimeRange(s.startTime, s.endTime)]));
    expect(result).toEqual({
      "police-sat-0630": "off",
      "police-sat-0930": "10:00 am – 12:00 pm",
      "mtn-sat-0600": "off",
      "mtn-sat-0930": "10:00 am – 12:00 pm",
    });
    expect(sat.every((s) => s.specialDayName === "National Sanitation Day")).toBe(true);
    expect(at(nov, "police-sat-0930", "2026-11-07")).toMatchObject({ change: "moved", originalStart: "09:30" });
  });

  it("only the first Saturday is touched", () => {
    expect(nov.filter((s) => s.specialDayRuleId)).toHaveLength(4);
    expect(at(nov, "police-sat-0930", "2026-11-14")).toMatchObject({ startTime: "09:30", change: "none" });
  });

  it("is in a stable order: by date, then location, then time", () => {
    const keys = nov.map((s) => `${s.date}|${s.locationId}|${s.startTime}`);
    expect([...keys].sort()).toEqual(keys);
  });
});

describe("July 2026 (starts on a Wednesday)", () => {
  const jul = resolveMonthSessions("2026-07", slots, [sanitation], settings);

  it("has a 5th week, and drops the dates outside July", () => {
    expect(jul.some((s) => s.date === "2026-06-30")).toBe(false);
    expect(jul.some((s) => s.date.startsWith("2026-08"))).toBe(false);
    const week5 = jul.filter((s) => s.weekIndex === 5).map((s) => `${s.slotId}@${s.date}`).sort();
    expect(week5).toEqual(["mtn-fri-0600@2026-07-31", "police-fri-0600@2026-07-31", "police-fri-0800@2026-07-31", "police-fri-1600@2026-07-31", "police-tue-1600@2026-07-28"]);
  });

  it("Week 1 has no Tuesday (30 June), and Sanitation Day is Sat 4 July", () => {
    expect(jul.filter((s) => s.weekIndex === 1 && s.slotId === "police-tue-1600")).toHaveLength(0);
    expect(at(jul, "police-sat-0630", "2026-07-04").isCancelled).toBe(true);
  });

  it("without the 5th week, those sessions aren't scheduled", () => {
    const four = resolveMonthSessions("2026-07", slots, [sanitation], { ...settings, includeFifthWeek: false });
    expect(four.some((s) => s.weekIndex === 5)).toBe(false);
    expect(jul.length - four.length).toBe(5);
  });

  it("with the n-th weekday rule, Week 1 is the first of each weekday", () => {
    const nth = resolveMonthSessions("2026-07", slots, [], { weekRule: "nth_weekday", includeFifthWeek: false });
    expect(at(nth, "police-tue-1600", "2026-07-07").weekIndex).toBe(1);
    expect(at(nth, "mtn-sun-0630", "2026-07-05").weekIndex).toBe(1);
  });
});

describe("the other recurring actions", () => {
  it("shift_all_to_cutoff moves every early slot to 10:00, and says when two now overlap", () => {
    const nov = resolveMonthSessions("2026-11", slots, [{ ...sanitation, action: "shift_all_to_cutoff" }], settings);
    expect(at(nov, "police-sat-0630", "2026-11-07")).toMatchObject({ startTime: "10:00", endTime: "12:00", isCancelled: false });
    expect(at(nov, "mtn-sat-0600", "2026-11-07")).toMatchObject({ startTime: "10:00", endTime: "12:00" });
    expect(overlapping(nov)).toHaveLength(2);
  });

  it("cancel_matching_slots cancels what starts before the cutoff, or the whole day without one", () => {
    const withCutoff = resolveMonthSessions("2026-11", slots, [{ ...sanitation, action: "cancel_matching_slots" }], settings);
    expect(withCutoff.filter((s) => s.date === "2026-11-07" && s.isCancelled)).toHaveLength(4);
    const wholeDay = resolveMonthSessions("2026-11", slots, [{ ...sanitation, action: "cancel_matching_slots", cutoffTime: null }], settings);
    expect(wholeDay.filter((s) => s.date === "2026-11-07").every((s) => s.isCancelled)).toBe(true);
  });

  it("a rule can be limited to some locations, and switched off", () => {
    const police = resolveMonthSessions("2026-11", slots, [{ ...sanitation, locationIds: ["police"] }], settings);
    expect(at(police, "mtn-sat-0600", "2026-11-07").isCancelled).toBe(false);
    expect(at(police, "police-sat-0630", "2026-11-07").isCancelled).toBe(true);
    const off = resolveMonthSessions("2026-11", slots, [{ ...sanitation, active: false }], settings);
    expect(off.some((s) => s.specialDayRuleId)).toBe(false);
  });
});

describe("one-off days", () => {
  const base: Omit<SpecialDayRule, "id" | "action"> = {
    name: "Circuit assembly",
    kind: "one_off",
    recurrence: null,
    date: "2026-11-21",
    endDate: "2026-11-22",
    locationIds: null,
    slotIds: null,
    cutoffTime: null,
    newStartTime: null,
    newEndTime: null,
    noteForMessages: "No public witnessing this weekend — circuit assembly.",
    noteForPdf: "Circuit assembly",
    active: true,
  };

  it("cancel: every slot over a date range", () => {
    const nov = resolveMonthSessions("2026-11", slots, [sanitation, { ...base, id: "assembly", action: "cancel" }], settings);
    const weekend = nov.filter((s) => s.date === "2026-11-21" || s.date === "2026-11-22");
    expect(weekend.length).toBe(7); // 4 Saturday slots + 3 Sunday slots
    expect(weekend.every((s) => s.isCancelled && s.note === "Circuit assembly")).toBe(true);
  });

  it("cancel: only chosen slots", () => {
    const nov = resolveMonthSessions("2026-11", slots, [{ ...base, id: "x", action: "cancel", slotIds: ["mtn-sun-0930"] }], settings);
    expect(nov.filter((s) => s.isCancelled).map((s) => s.slotId)).toEqual(["mtn-sun-0930"]);
  });

  it("change_time: new times on the chosen day", () => {
    const nov = resolveMonthSessions("2026-11", slots, [{ ...base, id: "x", action: "change_time", endDate: null, slotIds: ["police-sat-0930"], newStartTime: "13:00", newEndTime: "15:00" }], settings);
    expect(at(nov, "police-sat-0930", "2026-11-21")).toMatchObject({ startTime: "13:00", endTime: "15:00", change: "moved" });
  });

  it("add_session: an extra session at each chosen location", () => {
    const nov = resolveMonthSessions("2026-11", slots, [{ ...base, id: "extra", action: "add_session", date: "2026-11-25", endDate: null, locationIds: ["mtn"], newStartTime: "16:00", newEndTime: "18:00" }], settings);
    const added = nov.filter((s) => s.change === "added");
    expect(added).toEqual([expect.objectContaining({ date: "2026-11-25", locationId: "mtn", slotId: null, weekIndex: 4, startTime: "16:00" })]);
    expect(nov).toHaveLength(49);
  });

  it("a one-off day has the last word over a recurring one, and can't un-cancel", () => {
    const moved = resolveMonthSessions("2026-11", slots, [sanitation, { ...base, id: "x", action: "change_time", date: "2026-11-07", endDate: null, slotIds: null, newStartTime: "14:00", newEndTime: "16:00" }], settings);
    expect(at(moved, "police-sat-0930", "2026-11-07")).toMatchObject({ startTime: "14:00", specialDayRuleId: "x" });
    expect(at(moved, "police-sat-0630", "2026-11-07").isCancelled).toBe(true);
  });
});

describe("previews", () => {
  it("finds the next first Saturday", () => {
    expect(nextOccurrence(sanitation, "2026-11-18")).toBe("2026-12-05");
    expect(nextOccurrence(sanitation, "2026-11-07")).toBe("2026-11-07");
  });
});
