import "@fontsource/carlito/400.css";
import "@fontsource/carlito/700.css";
import "@fontsource/carlito/400-italic.css";

import { Fragment } from "react";

import type { LaidOutSheet, SheetCell } from "@/lib/print/sheet";

import { cellStyle, PRINT_FONT } from "./cell-style";

/**
 * The printed schedule (§11). Used as-is by `/print/[month]` and inside the
 * editor's A4 preview, so the preview is the PDF. Each location is its own
 * table — as in the original PDF — sized from the editor's column widths:
 * stretched to the page when "Shrink to fit page width" is on, at their
 * real widths when it's off.
 */
export function PrintSheet({ sheet, fitToWidth, fontSize }: { sheet: Pick<LaidOutSheet, "rows" | "sections" | "widths" | "heights">; fitToWidth: boolean; fontSize: number }) {
  return (
    <div
      className="print-sheet"
      style={{ fontFamily: PRINT_FONT, fontSize: `${fontSize}pt`, color: "#000", printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      {sheet.sections.map((section) => {
        const rows = sheet.rows.slice(section.from, section.to + 1);
        if (section.kind !== "table") {
          return (
            <div key={section.from} style={{ marginBottom: section.kind === "heading" ? "0.6em" : 0 }}>
              {rows.map((row, i) => (
                <div key={i} style={{ ...cellStyle(row[0].role, null), minHeight: section.kind === "heading" ? undefined : sheet.heights[section.from + i] * 0.8 }}>
                  {row[0].text}
                </div>
              ))}
            </div>
          );
        }
        const widths = sheet.widths.slice(0, section.cols);
        const total = widths.reduce((a, b) => a + b, 0);
        return (
          <table
            key={section.from}
            style={{ borderCollapse: "collapse", tableLayout: "fixed", width: fitToWidth ? "100%" : `${total}px`, marginBottom: "0.9em", breakInside: "avoid" }}
          >
            <colgroup>
              {widths.map((w, c) => (
                <col key={c} style={{ width: fitToWidth ? `${(w / total) * 100}%` : `${w}px` }} />
              ))}
            </colgroup>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ height: sheet.heights[section.from + i] }}>
                  {row.slice(0, section.cols).map((cell, c) => (cell.covered ? null : <PrintCell key={c} cell={cell} span={Math.min(cell.colSpan, section.cols - c)} />))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

function PrintCell({ cell, span }: { cell: SheetCell; span: number }) {
  const style = cellStyle(cell.role, cell.fill);
  if (cell.role === "week") {
    const [label, ...rest] = cell.text.split("\n");
    return (
      <td colSpan={span} style={style}>
        {label}
        {rest.length ? (
          <span style={{ display: "block", fontWeight: 400, fontSize: "0.78em", color: "#404040" }}>
            {rest.map((line, i) => (
              <Fragment key={i}>
                {i ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </span>
        ) : null}
      </td>
    );
  }
  return (
    <td colSpan={span} style={style}>
      {cell.text}
    </td>
  );
}
