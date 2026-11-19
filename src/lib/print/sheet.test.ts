import { describe, expect, it } from "vitest";

import { resolveMonthSessions, type SlotDef } from "@/lib/dates/sessions";
import { NATIONAL_SANITATION_DAY, type SpecialDayRule } from "@/lib/dates/special-days";
import { fromResolved } from "@/lib/schedule/month-view";

import { applyLayout, buildSheet, cellRef, columnLetter, normalise, toHtml, toTsv } from "./sheet";
import { printSource, type PrintLocation } from "./source";

const police: PrintLocation = {
  id: "police",
  key: "police",
  name: "Police Station – Westlands",
  pdfTitle: "POLICE STATION - (Tuesday, Friday, Saturday & Sunday)",
  pdfColor: "#B4E0A3",
  slots: [
    { id: "tue", weekday: "TUE", startTime: "16:00", endTime: "18:00", active: true, sortOrder: 1 },
    { id: "fri6", weekday: "FRI", startTime: "06:00", endTime: "08:00", active: true, sortOrder: 2 },
    { id: "fri8", weekday: "FRI", startTime: "08:00", endTime: "10:00", active: true, sortOrder: 3 },
    { id: "fri16", weekday: "FRI", startTime: "16:00", endTime: "18:00", active: true, sortOrder: 4 },
    { id: "sat630", weekday: "SAT", startTime: "06:30", endTime: "08:30", active: true, sortOrder: 5 },
    { id: "sat930", weekday: "SAT", startTime: "09:30", endTime: "11:30", active: true, sortOrder: 6 },
    { id: "sun", weekday: "SUN", startTime: "16:00", endTime: "18:00", active: true, sortOrder: 7 },
  ],
  labels: {
    tue: { day: "Tuesday", time: "4:00 – 6:00pm" },
    fri6: { day: "FRIDAY", time: "6:00 – 8:00 AM" },
    fri8: { day: "FRIDAY", time: "8:00 – 10:00 AM" },
    fri16: { day: "FRIDAY", time: "4:00 – 6:00 pm" },
    sat630: { day: "SATURDAY", time: "6:30 – 8:30 AM" },
    sat930: { day: "SATURDAY", time: "9:30 – 11:30AM" },
    sun: { day: "SUNDAY", time: "4:00 – 6:00 PM" },
  },
};

const sanitation = { ...NATIONAL_SANITATION_DAY, id: "nsd", active: true } as SpecialDayRule;
const slots: SlotDef[] = police.slots.map((s) => ({ ...s, locationId: "police" }));
const sessions = resolveMonthSessions("2026-12", slots, [sanitation], { weekRule: "calendar_week", includeFifthWeek: true })
  .map(fromResolved)
  .map((s) => (s.slotId === "tue" && s.date === "2026-12-01" ? { ...s, people: [{ id: "a", name: "Asantewaa Bittermann", title: "Sis" as const }, { id: "b", name: "Julia Eshun", title: "Sis" as const }] } : s));

const sheet = buildSheet(printSource({ congregation: "Westlands English Congregation", month: "2026-12", locations: [police], sessions, updated: "19 November 2026" }));
const text = (ref: string) => {
  const col = ref.charCodeAt(0) - 65;
  const row = Number(ref.slice(1)) - 1;
  return sheet.rows[row][col];
};

describe("the printed sheet", () => {
  it("has the title, the subtitle and columns A–H for a seven-slot location", () => {
    expect(sheet.cols).toBe(8);
    expect(text("A1")).toMatchObject({ text: "WESTLANDS ENGLISH CONGREGATION", role: "title", colSpan: 8 });
    expect(text("A2").text).toBe("PUBLIC WITNESSING SCHEDULE – DECEMBER 2026");
  });

  it("draws the location's title bar in its colour across the table", () => {
    expect(text("A4")).toMatchObject({ text: "POLICE STATION - (Tuesday, Friday, Saturday & Sunday)", fill: "#B4E0A3", colSpan: 8 });
  });

  it("merges the day headers: Tuesday | FRIDAY ×3 | SATURDAY ×2 | SUNDAY", () => {
    const day = sheet.rows[4].filter((c) => !c.covered && c.text).map((c) => `${c.text}×${c.colSpan}`);
    expect(day).toEqual(["Tuesday×1", "FRIDAY×3", "SATURDAY×2", "SUNDAY×1"]);
  });

  it("starts the time row with WEEK and uses the old sheet's labels", () => {
    expect(sheet.rows[5].map((c) => c.text)).toEqual(["WEEK", "4:00 – 6:00pm", "6:00 – 8:00 AM", "8:00 – 10:00 AM", "4:00 – 6:00 pm", "6:30 – 8:30 AM", "9:30 – 11:30AM", "4:00 – 6:00 PM"]);
  });

  it("puts two names on two lines, and the week's dates under its label", () => {
    expect(text("A7").text).toBe("Week 1\n1 – 6 Dec");
    expect(text("B7").text).toBe("Asantewaa Bittermann\nJulia Eshun");
  });

  it("greys out Sanitation Day's cancelled cell, stars the moved one, and explains it underneath", () => {
    expect(text("F7")).toMatchObject({ text: "No session\nNational Sanitation Day", role: "cancelled", fill: "#D9D9D9" });
    expect(text("G7")).toMatchObject({ text: "* 10:00 am – 12:00 pm", role: "moved" });
    const notes = sheet.rows.filter((row) => row[0].role === "note").map((row) => row[0].text);
    expect(notes).toEqual(["* National Sanitation Day (first Saturday): sessions before 10:00 am are cancelled, and the 9:30 am session starts at 10:00 am."]);
    expect(sheet.rows.at(-1)![0].text).toBe("Updated 19 November 2026");
  });
});

describe("editor layout", () => {
  it("applies typed text by ref, widths by letter and heights by row number", () => {
    const laid = applyLayout(sheet, { cellOverrides: { B7: "Changed\nby hand", B4: "inside a merge" }, columnWidths: { B: 150, C: 9999 }, rowHeights: { "7": 60 } });
    expect(laid.rows[6][1].text).toBe("Changed\nby hand");
    expect(laid.rows[3][1].text).toBe(""); // covered by the title bar: ignored
    expect(laid.overridden).toEqual(new Set(["B7"]));
    expect(laid.widths.slice(0, 3)).toEqual([80, 150, 600]);
    expect(laid.heights[6]).toBe(60);
  });

  it("names cells like a spreadsheet", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(cellRef(6, 1)).toBe("B7");
  });
});

describe("copying a range", () => {
  const range = normalise({ r: 6, c: 0 }, { r: 5, c: 2 });

  it("writes tab-separated text, quoting cells with line breaks", () => {
    expect(toTsv(sheet, range)).toBe('WEEK\t4:00 – 6:00pm\t6:00 – 8:00 AM\r\n"Week 1\n1 – 6 Dec"\t"Asantewaa Bittermann\nJulia Eshun"\t');
  });

  it("writes an HTML table with merges and line breaks", () => {
    const html = toHtml(sheet, normalise({ r: 3, c: 0 }, { r: 4, c: 7 }));
    expect(html).toContain('colspan="8"');
    expect(html).toContain("background:#B4E0A3");
    expect(html).toContain('colspan="3"');
    expect(toHtml(sheet, range)).toContain("Asantewaa Bittermann<br>Julia Eshun");
  });
});

describe("the .xlsx export", () => {
  it("keeps merges, fills, bold, line breaks, widths and A4 setup", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { sheetToXlsx } = await import("./xlsx");
    const laid = applyLayout(sheet, { cellOverrides: {}, columnWidths: { B: 150 }, rowHeights: {} });
    const buffer = await sheetToXlsx(laid, { orientation: "landscape", margins: "normal", fitToWidth: true, fontSize: 11 }, "Test");

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = book.getWorksheet("Schedule")!;
    expect(ws.pageSetup).toMatchObject({ paperSize: 9, orientation: "landscape", fitToWidth: 1 });
    expect(ws.getCell("A1").value).toBe("WESTLANDS ENGLISH CONGREGATION");
    expect(ws.getCell("A1").font).toMatchObject({ bold: true, color: { argb: "FF1F3864" } });
    expect(ws.getCell("A4").fill).toMatchObject({ fgColor: { argb: "FFB4E0A3" } });
    expect(ws.getCell("H4").isMerged).toBe(true);
    expect(ws.getCell("C5").value).toBe("FRIDAY");
    expect(ws.getCell("E5").master.address).toBe("C5");
    expect(ws.getCell("B7").value).toBe("Asantewaa Bittermann\nJulia Eshun");
    expect(ws.getCell("F7").font).toMatchObject({ italic: true });
    expect(ws.getCell("F7").fill).toMatchObject({ fgColor: { argb: "FFD9D9D9" } });
    expect(ws.getColumn(2).width).toBeCloseTo((150 - 5) / 7, 1);
  });
});
