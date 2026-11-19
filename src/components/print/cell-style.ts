import type { CSSProperties } from "react";

import type { CellRole } from "@/lib/print/sheet";

/** The printed sheet's look (§11), shared by the print page and the editor so the editor is what-you-see. */
export const PRINT_FONT = "Carlito, Calibri, 'Segoe UI', sans-serif";
export const BORDER = "1px solid #BFBFBF";
export const NAVY = "#1F3864";
export const BLUE = "#2E75B6";

const BORDERLESS = new Set<CellRole>(["title", "subtitle", "spacer", "note", "footer"]);

export function cellStyle(role: CellRole, fill: string | null): CSSProperties {
  const style: CSSProperties = {
    border: BORDERLESS.has(role) ? "none" : BORDER,
    padding: "2px 5px",
    textAlign: "center",
    verticalAlign: "middle",
    whiteSpace: "pre-line",
    overflowWrap: "break-word",
    hyphens: "manual",
    lineHeight: 1.2,
    color: "#000",
  };
  if (fill) style.backgroundColor = fill;
  switch (role) {
    case "title":
      return { ...style, fontWeight: 700, fontSize: "1.45em", color: NAVY, letterSpacing: "0.01em" };
    case "subtitle":
      return { ...style, fontWeight: 700, fontSize: "1.18em", color: BLUE };
    case "bar":
      return { ...style, fontWeight: 700, fontSize: "1.05em" };
    case "day":
    case "time":
    case "week":
      return { ...style, fontWeight: 700 };
    case "cancelled":
      return { ...style, fontStyle: "italic", color: "#595959" };
    case "note":
      return { ...style, textAlign: "left", fontStyle: "italic", fontSize: "0.88em", padding: "1px 2px" };
    case "footer":
      return { ...style, textAlign: "left", fontSize: "0.82em", color: "#595959", padding: "4px 2px 0" };
    default:
      return style;
  }
}
