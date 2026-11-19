"use client";

import * as React from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";

import type { PrintSettings } from "@/db/queries/print";
import type { LaidOutSheet } from "@/lib/print/sheet";

import { PrintSheet } from "./print-sheet";

/** A4 at 96 CSS pixels per inch, which is what the browser prints at. */
const PAGE = { landscape: { w: 1123, h: 794 }, portrait: { w: 794, h: 1123 } };
const MARGIN = { normal: 48, narrow: 24 };

/**
 * The live print preview (§11): an A4 page at true size, scaled down to fit
 * the screen, holding the same `PrintSheet` the PDF uses. It measures the
 * sheet against the printable area and says plainly when it's too wide or
 * runs onto a second page.
 */
export function PrintPreview({ sheet, settings }: { sheet: LaidOutSheet; settings: PrintSettings }) {
  const page = PAGE[settings.orientation];
  const margin = MARGIN[settings.margins];
  const box = { w: page.w - margin * 2, h: page.h - margin * 2 };
  const wrap = React.useRef<HTMLDivElement>(null);
  const content = React.useRef<HTMLDivElement>(null);
  const [scale, setScale] = React.useState(0.6);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  React.useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / page.w));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [page.w]);

  React.useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const measure = () => setSize({ w: el.scrollWidth, h: el.scrollHeight });
    measure();
    document.fonts?.ready.then(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sheet, settings]);

  const tooWide = size.w > box.w + 1;
  const tooTall = size.h > box.h + 1;

  return (
    <div className="grid gap-3">
      <div ref={wrap} className="min-w-0" style={{ height: page.h * scale }}>
        <div
          className="overflow-hidden rounded-[3px] bg-white shadow-[0_2px_18px_rgb(0_0_0/0.14)] ring-1 ring-black/5"
          style={{ width: page.w, height: page.h, padding: margin, transform: `scale(${scale})`, transformOrigin: "top left" }}
          aria-label={`A4 ${settings.orientation} preview`}
        >
          <div ref={content} style={{ width: box.w }}>
            <PrintSheet sheet={sheet} fitToWidth={settings.fitToWidth} fontSize={settings.fontSize} />
          </div>
        </div>
      </div>
      {tooWide || tooTall ? (
        <div role="status" className="flex gap-2.5 rounded-xl border border-warning-border bg-warning px-3.5 py-2.5 text-[0.8125rem] text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {tooWide ? "The table is wider than the page. Turn on “Shrink to fit page width” or narrow some columns. " : ""}
            {tooTall ? `It runs onto a second page (${Math.round((size.h / box.h) * 100)}% of one page). Try narrow margins, a smaller font or shorter rows.` : ""}
          </span>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <CircleCheck className="size-4 text-primary" />
          Fits on one A4 page.
        </p>
      )}
    </div>
  );
}
