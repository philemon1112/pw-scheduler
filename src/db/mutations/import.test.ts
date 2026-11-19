import { readFileSync } from "node:fs";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import { parseSheet } from "@/lib/import/sheet-parse";
import { readXlsxGrid } from "@/lib/import/xlsx-grid";
import { applyLayout, buildSheet, type SheetSource } from "@/lib/print/sheet";
import { sheetToXlsx } from "@/lib/print/xlsx";
import { testDb } from "@/test/pglite";

import { applySeed } from "../seed-apply";
import { assignments, members, schedules, sessions, slots, users } from "../schema";

import { commitImport, ImportError, previewImport, type CommitInput } from "./import";

type Seed = {
  locations: { key: string; name: string; pdfTitle: string; pdfColor: string; slots: { key: string; pdfDay: string; pdfTime: string }[] }[];
  schedules: { month: string; assignments: { week: number; slot: string; members: string[] }[] }[];
};
const raw = JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8")) as Seed;
const november = raw.schedules.find((s) => s.month === "2026-11")!;

/** November's sheet, built straight from the seed file, as an .xlsx like the export makes. */
async function novemberXlsx(rename: Record<string, string> = {}) {
  const source: SheetSource = {
    congregation: "Westlands English Congregation",
    monthTitle: "NOVEMBER 2026",
    updated: "1 November 2026",
    notes: [],
    tables: raw.locations.map((l) => ({
      title: l.pdfTitle,
      color: l.pdfColor,
      columns: l.slots.map((s) => ({ day: s.pdfDay, time: s.pdfTime })),
      weeks: [1, 2, 3, 4].map((week) => ({
        label: `Week ${week}`,
        range: "",
        cells: l.slots.map((s) => {
          const a = november.assignments.find((x) => x.week === week && x.slot === s.key);
          return a ? { kind: "names" as const, names: a.members.map((n) => rename[n] ?? n) } : { kind: "none" as const };
        }),
      })),
    })),
  };
  const file = await sheetToXlsx(applyLayout(buildSheet(source), { cellOverrides: {}, columnWidths: {}, rowHeights: {} }), { orientation: "landscape", margins: "normal", fitToWidth: true, fontSize: 11 }, "Nov");
  return new Uint8Array(file).buffer;
}

async function seeded() {
  const { db } = await testDb();
  await applySeed(db, planSeed(raw), raw);
  const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
  return { db, userId: user.id };
}

const accept = (preview: Awaited<ReturnType<typeof previewImport>>, names: CommitInput["names"] = {}): CommitInput => ({
  batchId: preview.batchId,
  month: preview.month,
  tables: preview.tables.map((t) => ({ index: t.index, locationId: t.locationId, slotIds: t.columns.map((c) => c.slotId) })),
  names: { ...Object.fromEntries(preview.names.filter((n) => n.match).map((n) => [n.raw, n.match!.kind === "member" ? { memberId: n.match!.id } : { coupleId: n.match!.id }])), ...names },
});

describe("importing an old sheet", () => {
  it("reads back an exported month exactly: locations, slots, every name", async () => {
    const { db, userId } = await seeded();
    const tables = parseSheet(await readXlsxGrid(await novemberXlsx()));
    expect(tables.map((t) => t.columns.length)).toEqual([7, 5]);

    const preview = await previewImport(db, userId, { filename: "nov.xlsx", month: "2026-10", tables });
    expect(preview.tables.every((t) => t.locationId && t.columns.every((c) => c.slotId))).toBe(true);
    expect(preview.names.filter((n) => !n.match)).toEqual([]);

    const result = await commitImport(db, userId, accept(preview));
    expect(result).toEqual({ sessions: 48, membersCreated: 0, skipped: 0 });

    // Same pairs, week by week and slot by slot.
    const rows = await db
      .select({ key: slots.key, week: sessions.weekIndex, ids: assignments.memberIds, status: schedules.status })
      .from(assignments)
      .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
      .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
      .innerJoin(slots, eq(slots.id, sessions.slotId))
      .where(eq(schedules.month, "2026-10"));
    const names = new Map((await db.select().from(members)).map((m) => [m.id, m.displayName]));
    const got = rows.map((r) => `${r.week} ${r.key} ${r.ids.map((id) => names.get(id)).join(" + ")}`).sort();
    const want = november.assignments.map((a) => `${a.week} ${a.slot} ${a.members.join(" + ")}`).sort();
    expect(got).toEqual(want);
    expect(rows.every((r) => r.status === "archived")).toBe(true);
  });

  it("asks about names it doesn't know, and can add them as new members", async () => {
    const { db, userId } = await seeded();
    const tables = parseSheet(await readXlsxGrid(await novemberXlsx({ "Julia Eshun": "Juliana Eshun-Mensah" })));
    const preview = await previewImport(db, userId, { filename: "nov.xlsx", month: "2026-10", tables });
    expect(preview.names.filter((n) => !n.match).map((n) => n.raw)).toEqual(["Juliana Eshun-Mensah"]);
    const result = await commitImport(db, userId, accept(preview, { "Juliana Eshun-Mensah": { create: { title: "Sis" } } }));
    expect(result.membersCreated).toBe(1);
    const [added] = await db.select().from(members).where(eq(members.displayName, "Juliana Eshun-Mensah"));
    expect(added).toMatchObject({ title: "Sis", gender: "F", firstName: "Juliana", lastName: "Eshun-Mensah" });
  });

  it("won't overwrite a month with pairs made in the app", async () => {
    const { db, userId } = await seeded();
    const { generateMonth } = await import("./schedule");
    await generateMonth(db, userId, "2026-12", 1);
    const tables = parseSheet(await readXlsxGrid(await novemberXlsx()));
    const preview = await previewImport(db, userId, { filename: "nov.xlsx", month: "2026-12", tables });
    expect(preview.blocked).toBe(true);
    await expect(commitImport(db, userId, accept(preview))).rejects.toThrow(ImportError);
  });
});

describe("importing a Word schedule", () => {
  /** A table cell the way Word writes a hand-typed one: names split over runs, pushed down by breaks or spaces. */
  const cell = (xml: string, extra = "") => `<w:tc><w:tcPr>${extra}</w:tcPr><w:p>${xml}</w:p></w:tc>`;
  const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
  const br = "<w:r><w:br/></w:r>";
  const docx = async () => {
    const JSZip = (await import("jszip")).default;
    const row = (cells: string[]) => `<w:tr>${cells.join("")}</w:tr>`;
    const table = [
      row([cell(run("POLICE STATION - (Tuesday, Friday)"), '<w:gridSpan w:val="3"/><w:shd w:val="clear" w:color="auto" w:fill="B3E5A1"/>')]),
      row([cell(""), cell(run("Tuesday")), cell(run("FRIDAY"))]),
      row([cell(run("WEEK")), cell(run("4:00 – 6:00pm")), cell(run("6:00 – 8:00 AM"))]),
      row([cell(run("Week 1")), cell(run("Asantewaa ") + run("Bittermann") + br + run("Julia Eshun")), cell(run("Davida Adusei") + run("Comfort Owusua"))]),
      row([cell(run("Week 2")), cell(run("Abigail Boakye") + run(".          ") + run(" Bernice Sakyi")), cell(run("Comfort Owusua") + br + run("Lydia Mensah"))]),
    ].join("");
    const xml = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p>${run("WESTLANDS ENGLISH CONGREGATION")}</w:p><w:p>${run("PUBLIC WITNESSING SCHEDULE – NOVEMBER")}</w:p><w:tbl>${table}</w:tbl></w:body></w:document>`;
    const zip = new JSZip();
    zip.file("word/document.xml", xml);
    return zip.generateAsync({ type: "arraybuffer" });
  };

  it("reads Word tables, separating names by breaks, padding spaces, or by who is known", async () => {
    const { readDocxGrid } = await import("@/lib/import/docx-grid");
    const { db, userId } = await seeded();
    const tables = parseSheet(await readDocxGrid(await docx()));
    expect(tables).toHaveLength(1);
    expect(tables[0]).toMatchObject({ title: "POLICE STATION - (Tuesday, Friday)", color: "#B3E5A1" });
    const preview = await previewImport(db, userId, { filename: "nov.docx", month: "2026-10", tables });
    expect(preview.tables[0].weeks.map((w) => w.cells)).toEqual([
      [["Asantewaa Bittermann", "Julia Eshun"], ["Davida Adusei", "Comfort Owusua"]],
      [["Abigail Boakye", "Bernice Sakyi"], ["Comfort Owusua", "Lydia Mensah"]],
    ]);
    expect(preview.names.every((n) => n.match)).toBe(true);
    expect(preview.tables[0].columns.every((c) => c.slotId)).toBe(true);
    const result = await commitImport(db, userId, accept(preview));
    expect(result).toEqual({ sessions: 4, membersCreated: 0, skipped: 0 });
  });
});
