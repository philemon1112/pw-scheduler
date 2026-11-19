import JSZip from "jszip";

import type { RawCell } from "./sheet-parse";

/**
 * A Word schedule (.docx) as a plain grid of cells for `parseSheet` (§9) —
 * the same shape an .xlsx gives. The document is read in order: a paragraph
 * outside a table is a one-cell row (the title lines), each table row is a
 * row, a merged cell (`gridSpan`) covers the cells after it, and a shaded
 * cell keeps its colour so the location title bars are recognised.
 *
 * Inside a cell, line breaks, paragraph ends, tabs and runs of spaces all
 * separate lines: hand-typed schedules push the second name down with any
 * of them.
 */

const decode = (text: string) =>
  text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

/** The text of a run of WordprocessingML, with breaks as "\n". */
export function docxText(xml: string): string {
  const out: string[] = [];
  const token = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:br|cr)\b[^>]*\/>|<w:tab\b[^>]*\/>|<\/w:p>/g;
  for (let m = token.exec(xml); m; m = token.exec(xml)) out.push(m[1] !== undefined ? decode(m[1]) : "\n");
  return out
    .join("")
    .replace(/[ \u00a0]{2,}/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

/** Top-level elements of the body, in order, without descending into nested tables. */
function blocks(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    const tbl = body.indexOf("<w:tbl>", i);
    const p = body.search(/<w:p[ >]/g) >= 0 ? body.slice(i).search(/<w:p[ >]/) : -1;
    const pAt = p >= 0 ? i + p : -1;
    if (tbl < 0 && pAt < 0) break;
    if (tbl >= 0 && (pAt < 0 || tbl < pAt)) {
      // Find the matching </w:tbl>, counting nested tables.
      let depth = 0;
      let j = tbl;
      const tag = /<w:tbl>|<\/w:tbl>/g;
      tag.lastIndex = tbl;
      for (let m = tag.exec(body); m; m = tag.exec(body)) {
        depth += m[0] === "<w:tbl>" ? 1 : -1;
        if (depth === 0) {
          j = m.index + m[0].length;
          break;
        }
      }
      out.push(body.slice(tbl, j));
      i = j;
    } else {
      const end = body.indexOf("</w:p>", pAt);
      if (end < 0) break;
      out.push(body.slice(pAt, end + 6));
      i = end + 6;
    }
  }
  return out;
}

export function docxXmlToGrid(xml: string): RawCell[][] {
  const start = xml.indexOf("<w:body>");
  const body = start >= 0 ? xml.slice(start + 8) : xml;
  const grid: RawCell[][] = [];
  for (const block of blocks(body)) {
    if (!block.startsWith("<w:tbl>")) {
      const text = docxText(block);
      if (text) grid.push([{ text, covered: false, fill: null }]);
      continue;
    }
    for (const tr of block.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
      const row: RawCell[] = [];
      for (const tc of tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []) {
        const span = Number(/<w:gridSpan w:val="(\d+)"/.exec(tc)?.[1] ?? 1);
        const fill = /<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/.exec(tc)?.[1];
        row.push({ text: docxText(tc), covered: false, fill: fill ? `#${fill.toUpperCase()}` : null });
        for (let k = 1; k < span; k += 1) row.push({ text: "", covered: true, fill: null });
      }
      grid.push(row);
    }
  }
  return grid;
}

export async function readDocxGrid(data: ArrayBuffer): Promise<RawCell[][]> {
  const zip = await JSZip.loadAsync(data);
  const document = zip.file("word/document.xml");
  if (!document) return [];
  return docxXmlToGrid(await document.async("string"));
}
