/**
 * The printed schedule as a grid of cells (§11): the one model behind the
 * sheet editor, the print page and the spreadsheet export, so the three can't
 * drift apart. Rows and columns are numbered like a spreadsheet; a cell is
 * addressed as "B7", which is also how text typed into the editor is stored.
 */

export type CellRole =
  | "title"
  | "subtitle"
  | "spacer"
  | "bar"
  | "day"
  | "time"
  | "week"
  | "name"
  | "empty"
  | "cancelled"
  | "moved"
  | "note"
  | "footer";

export interface SheetCell {
  text: string;
  role: CellRole;
  /** Background, as `#RRGGBB`. */
  fill: string | null;
  colSpan: number;
  rowSpan: number;
  /** Inside another cell's merge: not drawn, copied as empty. */
  covered: boolean;
}

export interface SheetSection {
  kind: "heading" | "table" | "notes";
  /** First and last row, inclusive, 0-based. */
  from: number;
  to: number;
  /** Columns the section uses, from A. */
  cols: number;
}

export interface Sheet {
  cols: number;
  rows: SheetCell[][];
  sections: SheetSection[];
  defaultWidths: number[];
  defaultHeights: number[];
}

export type SourceCell =
  | { kind: "none" }
  | { kind: "names"; names: string[] }
  | { kind: "cancelled"; reason: string }
  | { kind: "moved"; time: string; names: string[] };

export interface SheetSource {
  congregation: string;
  /** "NOVEMBER 2026". */
  monthTitle: string;
  tables: {
    title: string;
    color: string;
    columns: { day: string; time: string }[];
    weeks: { label: string; range: string; cells: SourceCell[] }[];
  }[];
  notes: string[];
  /** "19 November 2026". */
  updated: string;
}

export const CANCELLED_FILL = "#D9D9D9";
const WIDTH_WEEK = 80;
const WIDTH_SLOT = 128;
const HEIGHTS: Record<CellRole, number> = {
  title: 30,
  subtitle: 24,
  spacer: 12,
  bar: 24,
  day: 21,
  time: 21,
  week: 44,
  name: 44,
  empty: 44,
  cancelled: 44,
  moved: 44,
  note: 20,
  footer: 20,
};

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export const cellRef = (row: number, col: number) => `${columnLetter(col)}${row + 1}`;

const blank = (role: CellRole = "spacer"): SheetCell => ({ text: "", role, fill: null, colSpan: 1, rowSpan: 1, covered: false });

/** Builds the grid from a month: heading, a table per location, notes, "Updated". */
export function buildSheet(source: SheetSource): Sheet {
  const cols = Math.max(2, ...source.tables.map((t) => t.columns.length + 1));
  const rows: SheetCell[][] = [];
  const heights: number[] = [];
  const sections: SheetSection[] = [];

  const merged = (text: string, role: CellRole, span: number, fill: string | null = null) => {
    const row = Array.from({ length: cols }, () => blank(role));
    row[0] = { text, role, fill, colSpan: span, rowSpan: 1, covered: false };
    for (let c = 1; c < span; c += 1) row[c] = { ...blank(role), fill, covered: true };
    return row;
  };
  const push = (row: SheetCell[], role: CellRole) => {
    rows.push(row);
    heights.push(HEIGHTS[role]);
  };

  push(merged(source.congregation.toUpperCase(), "title", cols), "title");
  push(merged(`PUBLIC WITNESSING SCHEDULE – ${source.monthTitle}`, "subtitle", cols), "subtitle");
  sections.push({ kind: "heading", from: 0, to: 1, cols });
  push(merged("", "spacer", 1), "spacer");

  for (const table of source.tables) {
    const span = table.columns.length + 1;
    const from = rows.length;
    push(merged(table.title, "bar", span, table.color), "bar");

    // Day row: consecutive slots on the same day share one merged header.
    const day = Array.from({ length: cols }, () => blank("day"));
    day[0] = { ...blank("day") };
    for (let c = 0; c < table.columns.length; ) {
      let end = c + 1;
      while (end < table.columns.length && table.columns[end].day === table.columns[c].day) end += 1;
      day[c + 1] = { text: table.columns[c].day, role: "day", fill: null, colSpan: end - c, rowSpan: 1, covered: false };
      for (let k = c + 1; k < end; k += 1) day[k + 1] = { ...blank("day"), covered: true };
      c = end;
    }
    push(day, "day");

    const time = Array.from({ length: cols }, () => blank("time"));
    time[0] = { ...blank("time"), text: "WEEK" };
    table.columns.forEach((column, c) => (time[c + 1] = { ...blank("time"), text: column.time }));
    push(time, "time");

    for (const week of table.weeks) {
      const row = Array.from({ length: cols }, () => blank("empty"));
      row[0] = { ...blank("week"), text: `${week.label}\n${week.range}` };
      week.cells.forEach((cell, c) => {
        switch (cell.kind) {
          case "none":
            row[c + 1] = blank("empty");
            break;
          case "names":
            row[c + 1] = { ...blank(cell.names.length ? "name" : "empty"), text: cell.names.join("\n") };
            break;
          case "cancelled":
            row[c + 1] = { ...blank("cancelled"), text: `No session\n${cell.reason}`, fill: CANCELLED_FILL };
            break;
          case "moved":
            row[c + 1] = { ...blank("moved"), text: [`* ${cell.time}`, ...cell.names].join("\n") };
            break;
        }
      });
      push(row, "week");
    }
    sections.push({ kind: "table", from, to: rows.length - 1, cols: span });
    push(merged("", "spacer", 1), "spacer");
  }

  const notesFrom = rows.length;
  for (const note of source.notes) push(merged(note, "note", cols), "note");
  push(merged(`Updated ${source.updated}`, "footer", cols), "footer");
  sections.push({ kind: "notes", from: notesFrom, to: rows.length - 1, cols });

  return {
    cols,
    rows,
    sections,
    defaultWidths: Array.from({ length: cols }, (_, c) => (c === 0 ? WIDTH_WEEK : WIDTH_SLOT)),
    defaultHeights: heights,
  };
}

export interface SheetLayout {
  columnWidths: Record<string, number>;
  rowHeights: Record<string, number>;
  cellOverrides: Record<string, string>;
}

export interface LaidOutSheet extends Sheet {
  widths: number[];
  heights: number[];
  /** Refs of cells whose text was typed in the editor. */
  overridden: Set<string>;
}

/**
 * Applies what was set in the editor: column widths (by letter), row heights
 * (by number) and typed text (by ref). Text for a ref that no longer exists —
 * the month gained or lost a week — is ignored rather than drawn elsewhere.
 */
export function applyLayout(sheet: Sheet, layout: SheetLayout): LaidOutSheet {
  const overridden = new Set<string>();
  const rows = sheet.rows.map((row, r) =>
    row.map((cell, c) => {
      const ref = cellRef(r, c);
      if (cell.covered || !(ref in layout.cellOverrides)) return cell;
      overridden.add(ref);
      return { ...cell, text: layout.cellOverrides[ref] };
    })
  );
  return {
    ...sheet,
    rows,
    widths: sheet.defaultWidths.map((w, c) => clamp(layout.columnWidths[columnLetter(c)] ?? w, 24, 600)),
    heights: sheet.defaultHeights.map((h, r) => clamp(layout.rowHeights[String(r + 1)] ?? h, 8, 400)),
    overridden,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export const normalise = (a: { r: number; c: number }, b: { r: number; c: number }): Range => ({
  r1: Math.min(a.r, b.r),
  c1: Math.min(a.c, b.c),
  r2: Math.max(a.r, b.r),
  c2: Math.max(a.c, b.c),
});

/** Tab-separated, with a cell quoted when it holds a tab, line break or quote — what Excel and Sheets expect. */
export function toTsv(sheet: Pick<Sheet, "rows">, range: Range): string {
  const quote = (text: string) => (/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
  const lines: string[] = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    const cells: string[] = [];
    for (let c = range.c1; c <= range.c2; c += 1) {
      const cell = sheet.rows[r]?.[c];
      cells.push(cell && !cell.covered ? quote(cell.text) : "");
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\r\n");
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The same range as an HTML table, with merges, fills and line breaks, so a
 * paste into Word or Google Docs keeps the look and a paste into Excel keeps
 * the merged headers.
 */
export function toHtml(sheet: Pick<Sheet, "rows">, range: Range): string {
  const out: string[] = ['<table style="border-collapse:collapse;font-family:Carlito,Calibri,sans-serif;font-size:11pt">'];
  for (let r = range.r1; r <= range.r2; r += 1) {
    out.push("<tr>");
    for (let c = range.c1; c <= range.c2; c += 1) {
      const cell = sheet.rows[r]?.[c];
      if (!cell || cell.covered) continue;
      const colSpan = Math.min(cell.colSpan, range.c2 - c + 1);
      const styles = ["border:1px solid #BFBFBF", "padding:2px 6px", "text-align:center", "vertical-align:middle"];
      if (cell.fill) styles.push(`background:${cell.fill}`);
      if (["title", "subtitle", "bar", "day", "time", "week"].includes(cell.role)) styles.push("font-weight:bold");
      if (cell.role === "cancelled") styles.push("font-style:italic;color:#595959");
      if (cell.role === "title") styles.push("color:#1F3864;font-size:16pt;border:none");
      if (cell.role === "subtitle") styles.push("color:#2E75B6;font-size:13pt;border:none");
      if (cell.role === "note" || cell.role === "footer" || cell.role === "spacer") styles.push("border:none;text-align:left");
      out.push(`<td${colSpan > 1 ? ` colspan="${colSpan}"` : ""} style="${styles.join(";")}">${escapeHtml(cell.text).replace(/\n/g, "<br>")}</td>`);
    }
    out.push("</tr>");
  }
  out.push("</table>");
  return out.join("");
}
