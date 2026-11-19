import { and, eq, ne, sql } from "drizzle-orm";

import { NATIONAL_SANITATION_DAY } from "@/lib/dates/special-days";
import type { SeedPlan } from "@/lib/import/seed-plan";
import { nameKey } from "@/lib/import/names";

import {
  assignments,
  couples,
  importBatches,
  locations,
  members,
  schedules,
  sessions,
  settings,
  slots,
  specialDayRules,
} from "./schema";
import type { AnyDb } from "./types";

export interface SeedReport {
  specialDaysAdded: number;
  locations: number;
  slots: number;
  membersAdded: number;
  couplesAdded: number;
  months: { month: string; sessions: number; action: "imported" | "replaced" | "skipped"; reason?: string }[];
}

/**
 * Write a seed plan. Safe to run again (§16, milestone 2):
 *
 * - Locations and slots are matched by key and kept up to date with the file.
 * - Members and couples are only *added*. Someone already there keeps what
 *   was edited in the app — title, phone, privilege — rather than having it
 *   reset to the file's guess.
 * - Each month is written as an archived, imported schedule. A month that was
 *   imported before is replaced; a month that has anything made in the app
 *   (a generated or manual assignment) is left alone and reported.
 *
 * All in one transaction: a failure halfway leaves the database as it was.
 */
export async function applySeed(database: AnyDb, plan: SeedPlan, raw: unknown): Promise<SeedReport> {
  return database.transaction(async (tx) => {
    await tx.insert(settings).values({ id: 1, congregationName: plan.congregation }).onConflictDoNothing();

    // National Sanitation Day (§7), on by default — added once, and left
    // alone after that so edits in the app stick.
    const [sanitation] = await tx.select({ id: specialDayRules.id }).from(specialDayRules).where(eq(specialDayRules.name, NATIONAL_SANITATION_DAY.name));
    let specialDaysAdded = 0;
    if (!sanitation) {
      await tx.insert(specialDayRules).values(NATIONAL_SANITATION_DAY);
      specialDaysAdded = 1;
    }

    // Locations and slots, by key.
    const locationIds = new Map<string, string>();
    const slotIds = new Map<string, { id: string; locationId: string }>();
    let slotCount = 0;
    for (const [index, location] of plan.locations.entries()) {
      const values = {
        key: location.key,
        name: location.name,
        messageName: location.messageName,
        pdfTitle: location.pdfTitle,
        pdfColor: location.pdfColor,
        sortOrder: index,
      };
      const [row] = await tx
        .insert(locations)
        .values(values)
        .onConflictDoUpdate({ target: locations.key, set: { ...values, updatedAt: sql`now()` } })
        .returning({ id: locations.id });
      locationIds.set(location.key, row.id);

      for (const [order, slot] of location.slots.entries()) {
        const slotValues = {
          locationId: row.id,
          key: slot.key,
          weekday: slot.weekday,
          startTime: slot.start,
          endTime: slot.end,
          pdfDayLabel: slot.pdfDay,
          pdfTimeLabel: slot.pdfTime,
          sortOrder: order,
        };
        const [saved] = await tx
          .insert(slots)
          .values(slotValues)
          .onConflictDoUpdate({ target: [slots.locationId, slots.key], set: { ...slotValues, updatedAt: sql`now()` } })
          .returning({ id: slots.id });
        slotIds.set(slot.key, { id: saved.id, locationId: row.id });
        slotCount += 1;
      }
    }

    // The weekend message lists MTN first, as Lemon's Thursday message does (D27).
    // Only set when it was never chosen, so a change made in Messages survives.
    const messageOrder = ["mtn", "police"].map((key) => locationIds.get(key)).filter((id): id is string => !!id);
    if (messageOrder.length > 0) {
      await tx.insert(settings).values({ id: 1 }).onConflictDoNothing();
      await tx
        .update(settings)
        .set({ messageLocationOrder: [...messageOrder, ...[...locationIds.values()].filter((id) => !messageOrder.includes(id))] })
        .where(and(eq(settings.id, 1), sql`${settings.messageLocationOrder} is null`));
    }

    // Members, added only.
    const added = await tx
      .insert(members)
      .values(plan.members)
      .onConflictDoNothing()
      .returning({ id: members.id });
    const everyone = await tx.select({ id: members.id, displayName: members.displayName, aliases: members.aliases }).from(members);
    const idOf = new Map<string, string>();
    for (const member of everyone) for (const name of [member.displayName, ...member.aliases]) idOf.set(nameKey(name), member.id);
    const id = (name: string) => {
      const found = idOf.get(nameKey(name));
      if (!found) throw new Error(`Seed member "${name}" is missing after insert.`);
      return found;
    };

    // Couples, added only, ids sorted (the table's check requires it).
    let couplesAdded = 0;
    const coupleIds = new Map<string, string>();
    for (const couple of plan.couples) {
      const [lo, hi] = [id(couple.a), id(couple.b)].sort();
      const inserted = await tx
        .insert(couples)
        .values({ memberAId: lo, memberBId: hi, displayLabel: couple.label })
        .onConflictDoNothing()
        .returning({ id: couples.id });
      couplesAdded += inserted.length;
      const [row] = await tx
        .select({ id: couples.id })
        .from(couples)
        .where(and(eq(couples.memberAId, lo), eq(couples.memberBId, hi)));
      coupleIds.set(`${lo}|${hi}`, row.id);
    }

    // Schedules.
    const months: SeedReport["months"] = [];
    for (const schedule of plan.schedules) {
      const [existing] = await tx.select().from(schedules).where(eq(schedules.month, schedule.month));
      let scheduleId: string;

      if (existing) {
        const [own] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(assignments)
          .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
          .where(and(eq(sessions.scheduleId, existing.id), ne(assignments.source, "imported")));
        if (own.n > 0) {
          months.push({ month: schedule.month, sessions: 0, action: "skipped", reason: "it has assignments made in the app" });
          continue;
        }
        await tx.delete(sessions).where(eq(sessions.scheduleId, existing.id));
        scheduleId = existing.id;
      } else {
        const [created] = await tx
          .insert(schedules)
          .values({ month: schedule.month, status: "archived", notes: `Imported from ${schedule.source}` })
          .returning({ id: schedules.id });
        scheduleId = created.id;
      }

      for (const session of schedule.sessions) {
        const slot = slotIds.get(session.slotKey)!;
        const [row] = await tx
          .insert(sessions)
          .values({
            scheduleId,
            slotId: slot.id,
            locationId: slot.locationId,
            date: session.date,
            startTime: session.start,
            endTime: session.end,
            weekIndex: session.week,
          })
          .returning({ id: sessions.id });
        const memberIds = session.members.map(id);
        const sorted = [...memberIds].sort();
        await tx.insert(assignments).values({
          sessionId: row.id,
          // Kept in the order the sheet wrote them; the pair-history view
          // sorts for comparison.
          memberIds,
          coupleId: session.couple ? coupleIds.get(sorted.join("|")) : null,
          source: "imported",
          status: "confirmed",
        });
      }

      await tx.insert(importBatches).values({
        sourceFilename: schedule.source,
        month: schedule.month,
        raw: (raw as { schedules: { month: string }[] }).schedules.find((s) => s.month === schedule.month) ?? {},
      });
      months.push({ month: schedule.month, sessions: schedule.sessions.length, action: existing ? "replaced" : "imported" });
    }


    return {
      specialDaysAdded,
      locations: plan.locations.length,
      slots: slotCount,
      membersAdded: added.length,
      couplesAdded,
      months,
    };
  });
}
