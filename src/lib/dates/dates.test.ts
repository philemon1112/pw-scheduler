import { describe, expect, it } from "vitest";

import { addDays, shiftMonth, todayInAccra, weekdayOf } from "./calendar";
import { formatTime, formatTimeRange } from "./time";
import { calendarWeeks, nthWeekday, slotDate, weekCount, weekRangeLabel } from "./weeks";

describe("calendar weeks (Mon–Sun, Friday in the month)", () => {
  it("November 2026 starts on a Sunday: 1 Nov belongs to October's last week", () => {
    const weeks = calendarWeeks("2026-11");
    expect(weeks.map((w) => [w.start, w.end])).toEqual([
      ["2026-11-02", "2026-11-08"],
      ["2026-11-09", "2026-11-15"],
      ["2026-11-16", "2026-11-22"],
      ["2026-11-23", "2026-11-29"],
    ]);
    expect(weekRangeLabel("2026-11", weeks[0])).toBe("2 – 8 Nov");
    expect(slotDate("2026-11", 1, "TUE", "calendar_week")).toBe("2026-11-03");
    expect(slotDate("2026-11", 2, "FRI", "calendar_week")).toBe("2026-11-13");
    expect(slotDate("2026-11", 2, "SUN", "calendar_week")).toBe("2026-11-15");
  });

  it("July 2026 starts on a Wednesday and has five weeks", () => {
    const weeks = calendarWeeks("2026-07");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toMatchObject({ start: "2026-06-29", end: "2026-07-05" });
    expect(weeks[4]).toMatchObject({ start: "2026-07-27", end: "2026-08-02" });
    expect(weekRangeLabel("2026-07", weeks[0])).toBe("1 – 5 Jul");
    expect(weekRangeLabel("2026-07", weeks[4])).toBe("27 – 31 Jul");
  });

  it("dates outside the month are not sessions of it", () => {
    expect(slotDate("2026-07", 1, "TUE", "calendar_week")).toBeNull(); // 30 June
    expect(slotDate("2026-07", 1, "FRI", "calendar_week")).toBe("2026-07-03");
    expect(slotDate("2026-07", 5, "FRI", "calendar_week")).toBe("2026-07-31");
    expect(slotDate("2026-07", 5, "SAT", "calendar_week")).toBeNull(); // 1 August
    expect(slotDate("2026-07", 6, "FRI", "calendar_week")).toBeNull();
  });

  it("every month has four or five weeks", () => {
    for (let month = "2026-01"; month <= "2027-12"; month = shiftMonth(month, 1)) {
      expect([4, 5]).toContain(weekCount(month, "calendar_week"));
    }
  });
});

describe("nth weekday", () => {
  it("counts from the 1st", () => {
    expect(nthWeekday("2026-11", 1, "SUN")).toBe("2026-11-01");
    expect(nthWeekday("2026-11", 1, "SAT")).toBe("2026-11-07");
    expect(nthWeekday("2026-11", 5, "SUN")).toBe("2026-11-29");
    expect(nthWeekday("2026-11", 5, "SAT")).toBeNull();
    expect(slotDate("2026-11", 2, "FRI", "nth_weekday")).toBe("2026-11-13");
    expect(weekCount("2026-11", "nth_weekday")).toBe(5);
  });
});

describe("dates", () => {
  it("weekday and arithmetic", () => {
    expect(weekdayOf("2026-11-01")).toBe("SUN");
    expect(weekdayOf("2026-07-01")).toBe("WED");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("today is Accra's today", () => {
    // 23:30 UTC is 23:30 in Accra (UTC+0 all year).
    expect(todayInAccra(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-18");
  });
});

describe("times", () => {
  it("formats like the messages", () => {
    expect(formatTimeRange("06:00", "08:00")).toBe("6:00 – 8:00 am");
    expect(formatTimeRange("09:30:00", "11:30:00")).toBe("9:30 – 11:30 am");
    expect(formatTimeRange("16:00", "18:00")).toBe("4:00 – 6:00 pm");
    expect(formatTimeRange("10:00", "12:00")).toBe("10:00 am – 12:00 pm");
    expect(formatTimeRange("11:00", "13:00")).toBe("11:00 am – 1:00 pm");
    expect(formatTime("00:30")).toBe("12:30 am");
    expect(formatTime("12:00")).toBe("12:00 pm");
  });
});
