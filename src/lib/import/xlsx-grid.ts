import ExcelJS from "exceljs";

import type { RawCell } from "./sheet-parse";

/**
 * An .xlsx file as a plain grid of cells for `parseSheet`: the first sheet
 * that has a "WEEK" row. ExcelJS reads it on the server; the file itself is
 * never stored, only what was read from it.
 */
export async function readXlsxGrid(data: ArrayBuffer): Promise<RawCell[][]> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data);
  const sheets = book.worksheets;
  for (const ws of sheets) {
    const grid: RawCell[][] = [];
    const rows = Math.min(ws.rowCount, 400);
    const cols = Math.min(ws.columnCount, 40);
    for (let r = 1; r <= rows; r += 1) {
      const row: RawCell[] = [];
      for (let c = 1; c <= cols; c += 1) {
        const cell = ws.getCell(r, c);
        const covered = cell.isMerged && cell.master.address !== cell.address;
        const fill = cell.fill && cell.fill.type === "pattern" && cell.fill.fgColor?.argb ? `#${cell.fill.fgColor.argb.slice(-6)}` : null;
        row.push({ text: covered ? "" : (cell.text ?? "").toString(), covered, fill });
      }
      grid.push(row);
    }
    if (grid.some((row) => row[0]?.text.trim().toUpperCase() === "WEEK")) return grid;
  }
  return [];
}
