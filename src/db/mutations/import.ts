import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { WEEKDAY_NAMES } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { cleanName, matchName, nameIndex, nameKey, splitKnownNames, splitName } from "@/lib/import/names";
import { dateRows, startFrom, weekdayFrom, type ParsedTable } from "@/lib/import/sheet-parse";

import { audit } from "../audit";
import { readSettings } from "../scheduler-input";
import { assignments, couples, importBatches, locations, members, schedules, sessions, slots } from "../schema";
import type { AnyDb } from "../types";

/** A refusal with a message for the person importing. */
export class ImportError extends Error {}

export type NameMatch = { kind: "member"; id: string } | { kind: "couple"; id: string } | null;

export interface ImportPreview {
  batchId: string;
  month: string;
  filename: string;
  tables: {
    index: number;
    title: string;
    color: string | null;
    locationId: string | null;
    columns: { day: string; time: string; slotId: string | null }[];
    weeks: { week: number; cells: string[][] }[];
  }[];
  names: { raw: string; match: NameMatch }[];
  locations: { id: string; name: string; slots: { id: string; label: string }[] }[];
  members: { id: string; name: string }[];
  couples: { id: string; label: string }[];
  /** The month already holds pairs made in the app, so importing it would be refused. */
  blocked: boolean;
}

const tokens = (text: string) =>
  new Set(
    text
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !["THE", "AND", "NEAR", "OFFICE", "TUESDAY", "FRIDAY", "SATURDAY", "SUNDAY", "MONDAY", "WEDNESDAY", "THURSDAY"].includes(t))
  );

async function catalogue(tx: AnyDb) {
  const [places, times, people, pairs] = await Promise.all([
    tx.select().from(locations),
    tx.select().from(slots),
    tx.select({ id: members.id, displayName: members.displayName, aliases: members.aliases, title: members.title }).from(members),
    tx.select({ id: couples.id, label: couples.displayLabel, a: couples.memberAId, b: couples.memberBId }).from(couples),
  ]);
  return { places, times, people, pairs };
}

/**
 * Step 1 (§9): reads what the parser found, stores it in `import_batches`,
 * and suggests which location each table is, which slot each column is and
 * who each name is. Nothing is imported yet.
 */
export async function previewImport(tx: AnyDb, userId: string, input: { filename: string; month: string; tables: ParsedTable[] }): Promise<ImportPreview> {
  if (input.tables.length === 0) throw new ImportError("No schedule found in that file. It needs a row starting with “WEEK”, like the printed sheet.");
  const { places, times, people, pairs } = await catalogue(tx);
  const index = nameIndex(people);
  const coupleLabels = new Set(pairs.map((c) => c.label.toLowerCase()));
  const known = (name: string) => index.has(nameKey(name)) || coupleLabels.has(name.toLowerCase());
  // Names typed together without a break are split where both halves are
  // known people; what is stored is what the review shows.
  const parsed: ParsedTable[] = input.tables.map((t) => ({ ...t, weeks: t.weeks.map((w) => ({ ...w, cells: w.cells.map((cell) => cell.flatMap((n) => splitKnownNames(n, known))) })) }));

  const tables = parsed.map((table, i) => {
    const words = tokens(table.title);
    const scored = places
      .map((p) => {
        const exact = [p.pdfTitle, p.name, p.messageName].some((t) => t.trim().toUpperCase() === table.title.toUpperCase());
        const overlap = [...tokens(`${p.pdfTitle} ${p.name} ${p.messageName} ${p.key}`)].filter((t) => words.has(t)).length;
        return { id: p.id, score: exact ? 100 : overlap };
      })
      .sort((a, b) => b.score - a.score);
    const locationId = scored[0]?.score > 0 ? scored[0].id : null;
    const mine = times.filter((s) => s.locationId === locationId);
    return {
      index: i,
      title: table.title,
      color: table.color,
      locationId,
      columns: table.columns.map((col) => {
        const weekday = weekdayFrom(col.day);
        const start = startFrom(col.time);
        const slot =
          mine.find((s) => s.weekday === weekday && s.startTime.slice(0, 5) === start) ??
          mine.find((s) => s.weekday === weekday && s.pdfTimeLabel.replace(/\s/g, "").toLowerCase() === col.time.replace(/\s/g, "").toLowerCase());
        return { day: col.day, time: col.time, slotId: slot?.id ?? null };
      }),
      weeks: table.weeks,
    };
  });

  const raws = [...new Set(parsed.flatMap((t) => t.weeks.flatMap((w) => w.cells.flat())))];
  const names = raws.map((raw): { raw: string; match: NameMatch } => {
    const couple = pairs.find((c) => c.label.toLowerCase() === cleanName(raw).toLowerCase());
    if (couple) return { raw, match: { kind: "couple", id: couple.id } };
    const member = matchName(index, raw);
    return { raw, match: member ? { kind: "member", id: member.id } : null };
  });

  const [existing] = await tx.select({ id: schedules.id }).from(schedules).where(eq(schedules.month, input.month)).limit(1);
  let blocked = false;
  if (existing) {
    const [own] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(assignments)
      .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
      .where(and(eq(sessions.scheduleId, existing.id), ne(assignments.source, "imported")));
    blocked = own.n > 0;
  }

  const [batch] = await tx.insert(importBatches).values({ sourceFilename: input.filename, month: input.month, raw: { tables: parsed }, createdBy: userId }).returning({ id: importBatches.id });

  return {
    batchId: batch.id,
    month: input.month,
    filename: input.filename,
    tables,
    names: names.sort((a, b) => Number(a.match !== null) - Number(b.match !== null) || a.raw.localeCompare(b.raw)),
    locations: places
      .filter((p) => !p.archivedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slots: times.filter((s) => s.locationId === p.id).map((s) => ({ id: s.id, label: `${WEEKDAY_NAMES[s.weekday].slice(0, 3)} ${formatTimeRange(s.startTime, s.endTime)}` })),
      })),
    members: people.map((p) => ({ id: p.id, name: `${p.title} ${p.displayName}` })).sort((a, b) => a.name.localeCompare(b.name)),
    couples: pairs.map((c) => ({ id: c.id, label: c.label })),
    blocked,
  };
}

const Uuid = z.string().uuid();

export const CommitInput = z.object({
  batchId: Uuid,
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  tables: z.array(z.object({ index: z.number().int().min(0), locationId: Uuid.nullable(), slotIds: z.array(Uuid.nullable()) })).max(20),
  names: z.record(
    z.string().max(200),
    z.union([z.object({ memberId: Uuid }), z.object({ coupleId: Uuid }), z.object({ create: z.object({ title: z.enum(["Bro", "Sis"]) }) }), z.object({ skip: z.literal(true) })])
  ),
});
export type CommitInput = z.infer<typeof CommitInput>;

/**
 * Step 2: imports the month as it was served — an archived schedule with
 * `source = imported`, so it becomes pair history (§9). The sheet is re-read
 * from the stored batch, not from the browser. A month with pairs made in
 * the app is refused; an earlier import of the same month is replaced.
 */
export async function commitImport(tx: AnyDb, userId: string, input: CommitInput) {
  const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, input.batchId)).limit(1);
  if (!batch) throw new ImportError("That upload has expired. Choose the file again.");
  const parsed = (batch.raw as { tables: ParsedTable[] }).tables ?? [];
  const settingsRow = await readSettings(tx);
  const { times, people, pairs } = await catalogue(tx);
  const slotById = new Map(times.map((s) => [s.id, s]));
  const known = new Set(people.map((p) => nameKey(p.displayName)));

  // New people first.
  const resolved = new Map<string, string[]>();
  let created = 0;
  for (const [raw, choice] of Object.entries(input.names)) {
    if ("memberId" in choice) resolved.set(raw, [choice.memberId]);
    else if ("coupleId" in choice) {
      const couple = pairs.find((c) => c.id === choice.coupleId);
      if (couple) resolved.set(raw, [couple.a, couple.b]);
    } else if ("create" in choice) {
      const name = cleanName(raw);
      if (known.has(nameKey(name))) throw new ImportError(`${name} is already in the members list. Choose them instead of adding them again.`);
      const { firstName, lastName } = splitName(name);
      const [row] = await tx
        .insert(members)
        .values({ title: choice.create.title, titleConfirmed: true, gender: choice.create.title === "Bro" ? "M" : "F", firstName, lastName, displayName: name })
        .returning({ id: members.id });
      known.add(nameKey(name));
      resolved.set(raw, [row.id]);
      created += 1;
    }
  }

  type Row = { slotId: string; weekday: (typeof times)[number]["weekday"]; week: number; memberIds: string[] };
  const rows: Row[] = [];
  let skipped = 0;
  for (const choice of input.tables) {
    const table = parsed[choice.index];
    if (!table || !choice.locationId) continue;
    for (const week of table.weeks) {
      week.cells.forEach((names, c) => {
        const slotId = choice.slotIds[c];
        const slot = slotId ? slotById.get(slotId) : undefined;
        if (!slot || slot.locationId !== choice.locationId) return void (names.length && (skipped += 1));
        const ids = [...new Set(names.flatMap((n) => resolved.get(n) ?? []))].slice(0, 2);
        if (ids.length === 0) return void (names.length && (skipped += 1));
        rows.push({ slotId: slot.id, weekday: slot.weekday, week: week.week, memberIds: ids });
      });
    }
  }
  if (rows.length === 0) throw new ImportError("Nothing to import: match at least one table to a location and its columns to slots.");

  const [existing] = await tx.select().from(schedules).where(eq(schedules.month, input.month)).limit(1);
  let scheduleId: string;
  if (existing) {
    const [own] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(assignments)
      .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
      .where(and(eq(sessions.scheduleId, existing.id), ne(assignments.source, "imported")));
    if (own.n > 0) throw new ImportError("That month has pairs made in the app. Importing would overwrite them, so it was stopped.");
    await tx.delete(sessions).where(eq(sessions.scheduleId, existing.id));
    await tx.update(schedules).set({ status: "archived", notes: `Imported from ${batch.sourceFilename}`, updatedAt: sql`now()` }).where(eq(schedules.id, existing.id));
    scheduleId = existing.id;
  } else {
    const [row] = await tx.insert(schedules).values({ month: input.month, status: "archived", notes: `Imported from ${batch.sourceFilename}` }).returning({ id: schedules.id });
    scheduleId = row.id;
  }

  const coupleOf = (ids: string[]) => {
    if (ids.length !== 2) return null;
    const [lo, hi] = [...ids].sort();
    return pairs.find((c) => [c.a, c.b].sort().join() === [lo, hi].join())?.id ?? null;
  };
  const seen = new Set<string>();
  let imported = 0;
  for (const row of dateRows(input.month, rows, settingsRow.weekRule)) {
    if (!row.date || seen.has(`${row.slotId}@${row.date}`)) {
      skipped += 1;
      continue;
    }
    seen.add(`${row.slotId}@${row.date}`);
    const slot = slotById.get(row.slotId)!;
    const [session] = await tx
      .insert(sessions)
      .values({ scheduleId, slotId: slot.id, locationId: slot.locationId, date: row.date, startTime: slot.startTime, endTime: slot.endTime, weekIndex: row.week })
      .returning({ id: sessions.id });
    await tx.insert(assignments).values({ sessionId: session.id, memberIds: row.memberIds, coupleId: coupleOf(row.memberIds), source: "imported", status: "confirmed" });
    imported += 1;
  }

  await tx.update(importBatches).set({ month: input.month, updatedAt: sql`now()` }).where(eq(importBatches.id, batch.id));
  await audit(tx, { userId, action: "import", entity: "schedule", entityId: scheduleId, diff: { month: input.month, file: batch.sourceFilename, sessions: imported, membersCreated: created, skipped } });
  return { sessions: imported, membersCreated: created, skipped };
}
