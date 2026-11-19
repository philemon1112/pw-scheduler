"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, RotateCcw } from "lucide-react";

import { saveLayoutAction } from "@/app/(app)/sheet/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import type { PrintSettings } from "@/db/queries/print";
import type { LayoutPatch } from "@/db/mutations/print";
import { applyLayout, cellRef, columnLetter, normalise, toHtml, toTsv, type Sheet, type SheetLayout } from "@/lib/print/sheet";
import { cn } from "@/lib/utils";

import { cellStyle, PRINT_FONT } from "./cell-style";
import { PrintPreview } from "./print-preview";

type Pos = { r: number; c: number };
const HEADER_W = 44;

/**
 * The sheet editor (§11): the printed schedule as a spreadsheet. Typing in a
 * cell changes only the printout (saved as an override), never the pairs.
 * Widths, heights and typed text save as you go; the preview below is the
 * PDF.
 */
export function SheetEditor({
  month,
  sheet,
  initialLayout,
  initialSettings,
  editable,
}: {
  month: string;
  sheet: Sheet;
  initialLayout: SheetLayout;
  initialSettings: PrintSettings;
  editable: boolean;
}) {
  const [layout, setLayout] = React.useState(initialLayout);
  const [settings, setSettings] = React.useState(initialSettings);
  const [anchor, setAnchor] = React.useState<Pos>({ r: 6, c: 1 });
  const [focus, setFocus] = React.useState<Pos>({ r: 6, c: 1 });
  const [editing, setEditing] = React.useState<{ pos: Pos; text: string } | null>(null);
  const grid = React.useRef<HTMLDivElement>(null);
  const selecting = React.useRef(false);

  const laid = React.useMemo(() => applyLayout(sheet, layout), [sheet, layout]);
  const range = normalise(anchor, focus);
  const rows = laid.rows.length;
  const cols = laid.cols;

  /** A covered cell belongs to the merge that covers it. */
  const origin = React.useCallback(
    (p: Pos): Pos => {
      const row = laid.rows[p.r];
      for (let k = p.c; k >= 0; k -= 1) if (!row[k].covered && k + row[k].colSpan > p.c) return { r: p.r, c: k };
      return p;
    },
    [laid.rows]
  );

  const save = React.useCallback(
    async (patch: LayoutPatch) => {
      if (!editable) return;
      const result = await saveLayoutAction(month, patch).catch(() => null);
      if (!result?.ok) toast.error(result?.error ?? "That didn't save. Check your connection.");
    },
    [editable, month]
  );

  const setCells = (cells: Record<string, string | null>) => {
    setLayout((current) => {
      const next = { ...current.cellOverrides };
      for (const [ref, text] of Object.entries(cells)) {
        if (text === null) delete next[ref];
        else next[ref] = text;
      }
      return { ...current, cellOverrides: next };
    });
    void save({ cells });
  };

  const commit = (pos: Pos, text: string) => {
    setEditing(null);
    const original = sheet.rows[pos.r][pos.c].text;
    const ref = cellRef(pos.r, pos.c);
    const current = layout.cellOverrides[ref] ?? original;
    if (text === current) return;
    setCells({ [ref]: text === original ? null : text });
  };

  const inRange = (r: number, c: number, cell: { colSpan: number }) => r >= range.r1 && r <= range.r2 && c <= range.c2 && c + cell.colSpan - 1 >= range.c1;

  const move = (dr: number, dc: number, extend: boolean) => {
    const from = extend ? focus : anchor;
    let next = { r: Math.min(rows - 1, Math.max(0, from.r + dr)), c: Math.min(cols - 1, Math.max(0, from.c + dc)) };
    // Step past a merge rather than landing inside it.
    if (dc > 0 && !extend) {
      const o = origin(from);
      next = { r: next.r, c: Math.min(cols - 1, o.c + laid.rows[o.r][o.c].colSpan) };
      if (next.c <= from.c) next.c = from.c;
    }
    next = origin(next);
    setFocus(next);
    if (!extend) setAnchor(next);
  };

  const copy = (data: DataTransfer | null) => {
    const tsv = toTsv(laid, range);
    const html = toHtml(laid, range);
    const count = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    if (data) {
      data.setData("text/plain", tsv);
      data.setData("text/html", html);
    } else if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      void navigator.clipboard
        .write([new ClipboardItem({ "text/plain": new Blob([tsv], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })])
        .catch(() => navigator.clipboard.writeText(tsv));
    } else {
      void navigator.clipboard?.writeText(tsv);
    }
    toast.success(`Copied ${count === 1 ? "1 cell" : `${range.r2 - range.r1 + 1} × ${range.c2 - range.c1 + 1} cells`}`, { description: "Paste into Excel, Google Sheets or Word." });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing) return;
    const extend = event.shiftKey;
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        return move(-1, 0, extend);
      case "ArrowDown":
        event.preventDefault();
        return move(1, 0, extend);
      case "ArrowLeft":
        event.preventDefault();
        return move(0, -1, extend);
      case "ArrowRight":
      case "Tab":
        event.preventDefault();
        return move(0, event.key === "Tab" && event.shiftKey ? -1 : 1, event.key === "Tab" ? false : extend);
      case "Enter":
      case "F2":
        if (!editable) return;
        event.preventDefault();
        return setEditing({ pos: anchor, text: laid.rows[anchor.r][anchor.c].text });
      case "Delete":
      case "Backspace": {
        if (!editable) return;
        event.preventDefault();
        const cells: Record<string, string | null> = {};
        for (let r = range.r1; r <= range.r2; r += 1)
          for (let c = range.c1; c <= range.c2; c += 1) {
            const cell = laid.rows[r][c];
            if (cell.covered || cell.text === "") continue;
            cells[cellRef(r, c)] = sheet.rows[r][c].text === "" ? null : "";
          }
        if (Object.keys(cells).length) setCells(cells);
        return;
      }
      default:
        if (editable && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          setEditing({ pos: anchor, text: event.key });
        }
    }
  };

  const overriddenInRange = [...laid.overridden].filter((ref) => {
    const c = ref.charCodeAt(0) - 65;
    const r = Number(ref.slice(1)) - 1;
    return r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
  });

  // Resizing by dragging a header edge.
  const startResize = (event: React.PointerEvent, kind: "col" | "row", index: number) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const start = kind === "col" ? event.clientX : event.clientY;
    const startSize = kind === "col" ? laid.widths[index] : laid.heights[index];
    const key = kind === "col" ? columnLetter(index) : String(index + 1);
    let size = startSize;
    const onMove = (e: PointerEvent) => {
      size = Math.round(Math.min(kind === "col" ? 600 : 400, Math.max(kind === "col" ? 24 : 8, startSize + (kind === "col" ? e.clientX : e.clientY) - start)));
      setLayout((current) => (kind === "col" ? { ...current, columnWidths: { ...current.columnWidths, [key]: size } } : { ...current, rowHeights: { ...current.rowHeights, [key]: size } }));
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      if (size !== startSize) void save(kind === "col" ? { columnWidths: { [key]: size } } : { rowHeights: { [key]: size } });
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
  };

  const changeSettings = (patch: Partial<PrintSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
    void save(patch);
  };

  React.useEffect(() => {
    const up = () => (selecting.current = false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const active = laid.rows[anchor.r]?.[anchor.c];
  const rangeLabel = range.r1 === range.r2 && range.c1 === range.c2 ? cellRef(range.r1, range.c1) : `${cellRef(range.r1, range.c1)}:${cellRef(range.r2, range.c2)}`;

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Name box + the active cell's text, like a spreadsheet's formula bar. */}
      <div className="rise flex min-w-0 flex-wrap items-center gap-2">
        <span className="tabular rounded-lg border border-border bg-card px-2.5 py-1.5 font-mono text-[0.75rem]" aria-label="Selected cells">
          {rangeLabel}
        </span>
        <span className="min-w-0 grow truncate rounded-lg border border-border bg-card px-3 py-1.5 text-[0.8125rem] text-muted-foreground" title={active?.text}>
          {active?.text.replace(/\n/g, " ⏎ ") || " "}
          {laid.overridden.has(cellRef(anchor.r, anchor.c)) ? <span className="ml-2 text-primary">· typed by hand</span> : null}
        </span>
        <Button variant="outline" size="sm" onClick={() => copy(null)}>
          <Copy />
          Copy cells
        </Button>
        {editable ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={overriddenInRange.length === 0}
            onClick={() => setCells(Object.fromEntries(overriddenInRange.map((ref) => [ref, null])))}
          >
            <RotateCcw />
            Reset {overriddenInRange.length > 1 ? `${overriddenInRange.length} cells` : "cell"}
          </Button>
        ) : null}
      </div>

      <div
        ref={grid}
        tabIndex={0}
        role="grid"
        aria-label="Printed sheet"
        aria-rowcount={rows}
        aria-colcount={cols}
        onKeyDown={onKeyDown}
        onCopy={(event) => {
          if (editing) return;
          event.preventDefault();
          copy(event.clipboardData);
        }}
        className="rise relative max-h-[70vh] min-w-0 overflow-auto rounded-2xl border border-border bg-white shadow-card outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/40 [animation-delay:60ms]"
        style={{ fontFamily: PRINT_FONT, fontSize: `${settings.fontSize}pt` }}
      >
        <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", width: HEADER_W + laid.widths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            <col style={{ width: HEADER_W }} />
            {laid.widths.map((w, c) => (
              <col key={c} style={{ width: w }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-30 border-r border-b border-border bg-muted" />
              {laid.widths.map((w, c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-20 h-7 border-r border-b border-border bg-muted text-center font-sans text-[0.6875rem] font-medium text-muted-foreground",
                    c >= range.c1 && c <= range.c2 && "bg-primary-soft text-accent-foreground"
                  )}
                >
                  <span className="relative block">
                    {columnLetter(c)}
                    <span className="tabular ml-1 font-normal opacity-70">{w}</span>
                    {editable ? (
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize column ${columnLetter(c)}`}
                        onPointerDown={(event) => startResize(event, "col", c)}
                        onDoubleClick={() => {
                          setLayout((current) => ({ ...current, columnWidths: { ...current.columnWidths, [columnLetter(c)]: sheet.defaultWidths[c] } }));
                          void save({ columnWidths: { [columnLetter(c)]: sheet.defaultWidths[c] } });
                        }}
                        className="absolute -top-1.5 -right-1.5 h-7 w-3 cursor-col-resize touch-none hover:bg-primary/30"
                      />
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {laid.rows.map((row, r) => (
              <tr key={r} style={{ height: laid.heights[r] }}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 border-r border-b border-border bg-muted p-0 text-center align-middle font-sans text-[0.6875rem] font-medium text-muted-foreground",
                    r >= range.r1 && r <= range.r2 && "bg-primary-soft text-accent-foreground"
                  )}
                  title={`Row ${r + 1} · ${laid.heights[r]}px`}
                >
                  <span className="relative block h-full">
                    {r + 1}
                    {editable ? (
                      <span
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Resize row ${r + 1}`}
                        onPointerDown={(event) => startResize(event, "row", r)}
                        className="absolute right-0 -bottom-1.5 left-0 h-3 cursor-row-resize touch-none hover:bg-primary/30"
                      />
                    ) : null}
                  </span>
                </th>
                {row.map((cell, c) => {
                  if (cell.covered) return null;
                  const ref = cellRef(r, c);
                  const selected = inRange(r, c, cell);
                  const isActive = anchor.r === r && anchor.c === c;
                  const style = cellStyle(cell.role, cell.fill);
                  const isEditing = editing && editing.pos.r === r && editing.pos.c === c;
                  return (
                    <td
                      key={c}
                      colSpan={cell.colSpan}
                      role="gridcell"
                      aria-selected={selected}
                      style={{
                        ...style,
                        border: style.border === "none" ? "1px solid #EEF0ED" : style.border,
                        position: "relative",
                        boxShadow: isActive ? "inset 0 0 0 2px var(--primary)" : selected ? "inset 0 0 0 999px rgb(31 111 74 / 0.08)" : undefined,
                        cursor: "cell",
                      }}
                      onMouseDown={(event) => {
                        if (isEditing) return;
                        grid.current?.focus({ preventScroll: true });
                        selecting.current = true;
                        if (event.shiftKey) setFocus({ r, c });
                        else {
                          setAnchor({ r, c });
                          setFocus({ r, c });
                        }
                      }}
                      onMouseEnter={() => selecting.current && setFocus({ r, c })}
                      onDoubleClick={() => editable && setEditing({ pos: { r, c }, text: cell.text })}
                    >
                      {cell.role === "week" && !isEditing ? <WeekLabel text={cell.text} /> : cell.text}
                      {laid.overridden.has(ref) ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-label="Typed by hand" /> : null}
                      {isEditing ? (
                        <textarea
                          autoFocus
                          aria-label={`Edit ${ref}`}
                          defaultValue={editing.text}
                          onFocus={(event) => event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length)}
                          onBlur={(event) => commit({ r, c }, event.currentTarget.value)}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditing(null);
                              grid.current?.focus();
                            } else if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
                              event.preventDefault();
                              commit({ r, c }, event.currentTarget.value);
                              move(1, 0, false);
                              grid.current?.focus();
                            } else if (event.key === "Enter") {
                              // Alt+Enter or Shift+Enter: a new line, as in Excel.
                              event.preventDefault();
                              const el = event.currentTarget;
                              const at = el.selectionStart;
                              el.value = `${el.value.slice(0, at)}\n${el.value.slice(el.selectionEnd)}`;
                              el.setSelectionRange(at + 1, at + 1);
                            } else if (event.key === "Tab") {
                              event.preventDefault();
                              commit({ r, c }, event.currentTarget.value);
                              move(0, 1, false);
                              grid.current?.focus();
                            }
                          }}
                          className="absolute inset-0 z-10 resize-none border-2 border-primary bg-white p-1 text-center outline-none"
                          style={{ font: "inherit", fontWeight: style.fontWeight, fontStyle: style.fontStyle, lineHeight: 1.2 }}
                        />
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="-mt-2 text-[0.75rem] text-muted-foreground">
        {editable
          ? "Double-click or start typing to change a cell; Alt+Enter for a new line. Changes only affect the printout. Drag a header edge to resize; double-click it to reset."
          : "Generate this month to edit its sheet. You can still copy and print it."}
      </p>

      <section className="rise grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5 [animation-delay:120ms]" aria-labelledby="preview">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="preview" className="font-display text-base font-semibold tracking-tight">
            Print preview
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Segmented
              label="Orientation"
              value={settings.orientation}
              options={[
                ["landscape", "Landscape"],
                ["portrait", "Portrait"],
              ]}
              onChange={(orientation) => changeSettings({ orientation })}
            />
            <Segmented
              label="Margins"
              value={settings.margins}
              options={[
                ["normal", "Normal"],
                ["narrow", "Narrow"],
              ]}
              onChange={(margins) => changeSettings({ margins })}
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="font-size" className="text-[0.8125rem] font-normal text-muted-foreground">
                Text
              </Label>
              <NativeSelect id="font-size" value={settings.fontSize} onChange={(event) => changeSettings({ fontSize: Number(event.target.value) })} className="w-24">
                {[9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} pt
                  </option>
                ))}
              </NativeSelect>
            </div>
            <label className="flex items-center gap-2 text-[0.8125rem]" htmlFor="fit-width">
              <Switch id="fit-width" checked={settings.fitToWidth} onCheckedChange={(fitToWidth) => changeSettings({ fitToWidth })} />
              Shrink to fit page width
            </label>
          </div>
        </div>
        <PrintPreview sheet={laid} settings={settings} />
      </section>
    </div>
  );
}

function WeekLabel({ text }: { text: string }) {
  const [label, ...rest] = text.split("\n");
  return (
    <>
      {label}
      {rest.length ? <span style={{ display: "block", fontWeight: 400, fontSize: "0.78em", color: "#404040" }}>{rest.join("\n")}</span> : null}
    </>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
      <div className="flex gap-0.5 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label={label}>
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={value === key}
            onClick={() => onChange(key)}
            className={cn(
              "min-h-8 rounded-md px-2.5 text-[0.75rem] font-medium transition-colors pointer-coarse:min-h-11",
              "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
              value === key ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
