import { describe, expect, it } from "vitest";

import { dateRows, namesIn, parseSheet, startFrom, weekdayFrom, type RawCell } from "./sheet-parse";

const c = (text: string, covered = false, fill: string | null = null): RawCell => ({ text, covered, fill });

describe("reading an old sheet", () => {
  it("finds the table: title, merged days, times, week rows with names", () => {
    const grid: RawCell[][] = [
      [c("WESTLANDS ENGLISH CONGREGATION"), c("", true), c("", true), c("", true)],
      [c("POLICE STATION - (Tuesday, Friday)", false, "#B4E0A3"), c("", true), c("", true), c("", true)],
      [c(""), c("Tuesday"), c("FRIDAY"), c("", true)],
      [c("WEEK"), c("4:00 – 6:00pm"), c("6:00 – 8:00 AM"), c("8:00 – 10:00 AM")],
      [c("Week 1\n3 – 8 Nov"), c("Asantewaa Bittermann\nJulia Eshun."), c("Sis Davida Adusei\nComfort Owusua"), c("No session\nNational Sanitation Day")],
      [c("Week 2"), c(""), c("* 10:00 am – 12:00 pm\nBro Jerry Bobby\nGeorge Dautey"), c("Beauty Odjo / Lily Owusu Mensah")],
      [c("Updated 1 Nov")],
    ];
    expect(parseSheet(grid)).toEqual([
      {
        title: "POLICE STATION - (Tuesday, Friday)",
        color: "#B4E0A3",
        columns: [
          { day: "Tuesday", time: "4:00 – 6:00pm" },
          { day: "FRIDAY", time: "6:00 – 8:00 AM" },
          { day: "FRIDAY", time: "8:00 – 10:00 AM" },
        ],
        weeks: [
          { week: 1, cells: [["Asantewaa Bittermann", "Julia Eshun"], ["Davida Adusei", "Comfort Owusua"], []] },
          { week: 2, cells: [[], ["Jerry Bobby", "George Dautey"], ["Beauty Odjo", "Lily Owusu Mensah"]] },
        ],
      },
    ]);
  });

  it("reads days and hand-typed times", () => {
    expect(weekdayFrom("FRIDAY")).toBe("FRI");
    expect(weekdayFrom("Sun")).toBe("SUN");
    expect(weekdayFrom("")).toBeNull();
    expect(startFrom("6:00 – 8:00 AM")).toBe("06:00");
    expect(startFrom("4:00 – 6:00pm")).toBe("16:00");
    expect(startFrom("9:30 – 11:30AM")).toBe("09:30");
    expect(startFrom("10:00 am – 12:00 pm")).toBe("10:00");
    expect(startFrom("10:00 – 12:00 pm")).toBe("10:00");
    expect(startFrom("whenever")).toBeNull();
    expect(namesIn("Bro & Sis Agbanawo")).toEqual(["Bro & Sis Agbanawo"]);
    expect(namesIn("Julia Eshun & Doris Adams")).toEqual(["Julia Eshun", "Doris Adams"]);
  });

  it("dates a column by n-th weekday when the week rule puts a row outside the month (D16)", () => {
    // July 2026: Mon–Sun Week 1 starts 29 June, so Week 1's Tuesday is 30 June.
    const rows = [1, 2, 3, 4].map((week) => ({ slotId: "tue", weekday: "TUE" as const, week }));
    expect(dateRows("2026-07", rows, "calendar_week").map((r) => r.date)).toEqual(["2026-07-07", "2026-07-14", "2026-07-21", "2026-07-28"]);
    expect(dateRows("2026-11", [{ slotId: "fri", weekday: "FRI", week: 2 }], "calendar_week")[0].date).toBe("2026-11-13");
  });
});
