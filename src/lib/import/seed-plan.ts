import { z } from "zod";

import { WEEKDAYS, type Weekday } from "@/lib/dates/calendar";
import { nthWeekday, slotDate, type WeekRule } from "@/lib/dates/weeks";

import { cleanName, nameKey, splitName } from "./names";

/**
 * `seed/pw-history-2026.json` → the rows to write, checked (§9).
 *
 * Pure: it reads nothing and writes nothing, so everything about the seed —
 * every name resolving, every slot existing, every date landing in its month
 * — is tested without a database. `applySeed` then writes the plan.
 */

const Time = z.string().regex(/^\d{2}:\d{2}$/);
const SeedFile = z.object({
  congregation: z.string().min(1),
  timezone: z.string().min(1),
  locations: z
    .array(
      z.object({
        key: z.string().min(1),
        name: z.string().min(1),
        messageName: z.string().min(1),
        pdfTitle: z.string().min(1),
        pdfColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        slots: z
          .array(
            z.object({
              key: z.string().min(1),
              weekday: z.enum(WEEKDAYS as [Weekday, ...Weekday[]]),
              start: Time,
              end: Time,
              pdfDay: z.string().min(1),
              pdfTime: z.string().min(1),
            })
          )
          .min(1),
      })
    )
    .min(1),
  couples: z.array(z.tuple([z.string(), z.string()])),
  members: z.array(z.object({ name: z.string().min(1), title: z.enum(["Bro", "Sis"]), titleConfirmed: z.boolean() })).min(1),
  schedules: z.array(
    z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      source: z.string().min(1),
      assignments: z.array(z.object({ week: z.number().int().min(1).max(5), slot: z.string(), members: z.array(z.string()).min(1).max(2) })),
    })
  ),
});

export type SeedFile = z.infer<typeof SeedFile>;

/** Other spellings seen in the old schedules (see the seed's `_notes`). */
const KNOWN_ALIASES: Record<string, string[]> = {
  "henry atsu damey": ["Henry Atsu Dameh"],
};

export interface PlannedMember {
  displayName: string;
  firstName: string;
  lastName: string;
  title: "Bro" | "Sis";
  gender: "M" | "F";
  titleConfirmed: boolean;
  aliases: string[];
}

export interface PlannedSession {
  slotKey: string;
  locationKey: string;
  week: number;
  date: string;
  start: string;
  end: string;
  /** Display names, as stored. */
  members: string[];
  /** The two are a seeded couple. */
  couple: boolean;
}

export interface SeedPlan {
  congregation: string;
  locations: SeedFile["locations"];
  members: PlannedMember[];
  couples: { a: string; b: string; label: string }[];
  schedules: { month: string; source: string; sessions: PlannedSession[] }[];
  /** Anything that will be imported but deserves a look. */
  notes: string[];
}

export function planSeed(raw: unknown, rule: WeekRule = "calendar_week"): SeedPlan {
  const file = SeedFile.parse(raw);
  const notes: string[] = [];

  const members: PlannedMember[] = file.members.map((member) => {
    const displayName = cleanName(member.name);
    return {
      displayName,
      ...splitName(displayName),
      title: member.title,
      gender: member.title === "Bro" ? "M" : "F",
      titleConfirmed: member.titleConfirmed,
      aliases: KNOWN_ALIASES[nameKey(displayName)] ?? [],
    };
  });
  const byName = new Map(members.flatMap((m) => [m.displayName, ...m.aliases].map((name) => [nameKey(name), m] as const)));
  const resolve = (name: string, where: string) => {
    const member = byName.get(nameKey(name));
    if (!member) throw new Error(`Unknown member "${name}" in ${where}.`);
    return member;
  };

  const couples = file.couples.map(([a, b]) => {
    const x = resolve(a, "couples");
    const y = resolve(b, "couples");
    if (x.gender === y.gender) notes.push(`Couple ${x.displayName} & ${y.displayName} share a title.`);
    const husband = x.gender === "M" ? x : y;
    return { a: x.displayName, b: y.displayName, label: `Bro & Sis ${husband.lastName}` };
  });
  const coupleKeys = new Set(couples.map((c) => [nameKey(c.a), nameKey(c.b)].sort().join("|")));

  const slots = new Map(file.locations.flatMap((location) => location.slots.map((slot) => [slot.key, { ...slot, locationKey: location.key }] as const)));

  const schedules = file.schedules.map((schedule) => {
    // The old sheets were filled in by hand, one column per slot. Where the
    // week rule can't place every row of a column inside the month — July
    // 2026's Week 1 Tuesday is 30 June — the sheet's rows can only have meant
    // that weekday's 1st, 2nd, 3rd… date in the month, so the whole column is
    // dated that way. Moving just the one row would land it on Week 2's date.
    const byWeek = (slotKey: string) => schedule.assignments.filter((a) => a.slot === slotKey).map((a) => a.week);
    const fallback = new Set<string>();
    for (const slotKey of new Set(schedule.assignments.map((a) => a.slot))) {
      const slot = slots.get(slotKey);
      if (slot && byWeek(slotKey).some((week) => !slotDate(schedule.month, week, slot.weekday, rule))) {
        fallback.add(slotKey);
        notes.push(`${schedule.month} ${slotKey}: dated by n-th ${slot.weekday} (the week rule puts a row outside the month).`);
      }
    }

    return {
      month: schedule.month,
      source: schedule.source,
      sessions: schedule.assignments.map((assignment) => {
        const slot = slots.get(assignment.slot);
        if (!slot) throw new Error(`Unknown slot "${assignment.slot}" in ${schedule.month}.`);
        const names = assignment.members.map((name) => resolve(name, `${schedule.month} week ${assignment.week}`).displayName);
        const date = fallback.has(slot.key)
          ? nthWeekday(schedule.month, assignment.week, slot.weekday)
          : slotDate(schedule.month, assignment.week, slot.weekday, rule);
        if (!date) throw new Error(`${schedule.month} week ${assignment.week} has no ${slot.weekday}.`);

        return {
          slotKey: slot.key,
          locationKey: slot.locationKey,
          week: assignment.week,
          date,
          start: slot.start,
          end: slot.end,
          members: names,
          couple: names.length === 2 && coupleKeys.has(names.map(nameKey).sort().join("|")),
        };
      }),
    };
  });

  return { congregation: file.congregation, locations: file.locations, members, couples, schedules, notes };
}
