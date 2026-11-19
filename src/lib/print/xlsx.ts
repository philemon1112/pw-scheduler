import ExcelJS from "exceljs";

import type { PrintSettings } from "@/db/queries/print";

import type { CellRole, LaidOutSheet } from "./sheet";

const BORDERLESS = new Set<CellRole>(["title", "subtitle", "spacer", "note", "footer"]);
const BOLD = new Set<CellRole>(["title", "subtitle", "bar", "day", "time", "week"]);
const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const thin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFBFBFBF" } };

/** Screen pixels to Excel's column width (characters of the default font) and row height (points). */
const columnWidth = (px: number) => Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);
const rowHeight = (px: number) => Math.round(px * 0.75 * 100) / 100;

function fontFor(role: CellRole, size: number): Partial<ExcelJS.Font> {
  const font: Partial<ExcelJS.Font> = { name: "Calibri", size, bold: BOLD.has(role) };
  switch (role) {
    case "title":
      return { ...font, size: Math.round(size * 1.45), color: { argb: "FF1F3864" } };
    case "subtitle":
      return { ...font, size: Math.round(size * 1.18), color: { argb: "FF2E75B6" } };
    case "bar":
      return { ...font, size: size + 0.5 };
    case "cancelled":
      return { ...font, italic: true, color: { argb: "FF595959" } };
    case "note":
      return { ...font, italic: true, size: size - 1 };
    case "footer":
      return { ...font, size: size - 2, color: { argb: "FF595959" } };
    default:
      return font;
  }
}

/**
 * The sheet as an .xlsx file (§11): the same cells, merges, fills, fonts,
 * widths and heights as the PDF, with A4 page setup. Calibri is named rather
 * than Carlito — Carlito is Calibri's free twin, and Excel has Calibri.
 */
export async function sheetToXlsx(sheet: LaidOutSheet, settings: PrintSettings, title: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PW Scheduler";
  workbook.title = title;
  const margin = settings.margins === "narrow" ? 0.25 : 0.5;
  const ws = workbook.addWorksheet("Schedule", {
    pageSetup: {
      paperSize: 9,
      orientation: settings.orientation,
      fitToPage: settings.fitToWidth,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: margin, right: margin, top: margin, bottom: margin, header: 0.2, footer: 0.2 },
    },
    views: [{ showGridLines: false }],
  });

  ws.columns = sheet.widths.map((w) => ({ width: columnWidth(w) }));
  const size = settings.fontSize;

  sheet.rows.forEach((row, r) => {
    const excelRow = ws.getRow(r + 1);
    excelRow.height = rowHeight(sheet.heights[r]);
    row.forEach((cell, c) => {
      if (cell.covered) return;
      const target = excelRow.getCell(c + 1);
      if (cell.role === "week" && cell.text.includes("\n")) {
        const [label, ...rest] = cell.text.split("\n");
        target.value = {
          richText: [
            { text: label, font: { name: "Calibri", size, bold: true } },
            { text: `\n${rest.join("\n")}`, font: { name: "Calibri", size: size - 2, color: { argb: "FF404040" } } },
          ],
        };
      } else {
        target.value = cell.text;
      }
      const left = cell.role === "note" || cell.role === "footer";
      const style: Partial<ExcelJS.Style> = {
        font: fontFor(cell.role, size),
        alignment: { horizontal: left ? "left" : "center", vertical: "middle", wrapText: true },
      };
      if (cell.fill) style.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(cell.fill) } };
      const border = BORDERLESS.has(cell.role) ? undefined : { top: thin, left: thin, bottom: thin, right: thin };

      // A merged cell is styled across its whole span, or Excel draws its border and fill only on the first.
      for (let k = 0; k < cell.colSpan; k += 1) {
        const part = excelRow.getCell(c + 1 + k);
        part.style = { ...style, ...(border ? { border } : {}) };
      }
      if (cell.colSpan > 1) ws.mergeCells(r + 1, c + 1, r + 1, c + cell.colSpan);
    });
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
