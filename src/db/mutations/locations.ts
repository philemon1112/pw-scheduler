import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { minutesOf } from "@/lib/dates/time";
import type { LocationInput } from "@/lib/locations/input";

import { audit } from "../audit";
import { locations, sessions, slots } from "../schema";
import type { AnyDb } from "../types";

/** `police` + Friday 06:00 → `police-fri-0600`, the key the seed uses. */
export const slotKey = (locationKey: string, weekday: string, start: string) =>
  `${locationKey}-${weekday.toLowerCase()}-${start.slice(0, 5).replace(":", "")}`;

const keyOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "location";

/**
 * Save a location and its slot table.
 *
 * A slot that has sessions is never deleted — leaving it out of the table
 * turns it off instead — because its past sessions are the pair history. Two
 * active slots can't start at the same time on the same day, which would put
 * two sessions in one cell of the sheet.
 */
export async function saveLocation(tx: AnyDb, userId: string, input: LocationInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const live = input.slots.filter((slot) => slot.active);
  const seen = new Set<string>();
  for (const slot of live) {
    const key = `${slot.weekday}|${minutesOf(slot.startTime)}`;
    if (seen.has(key)) return { ok: false, error: "Two slots start at the same time on the same day." };
    seen.add(key);
  }

  const values = {
    name: input.name,
    messageName: input.messageName,
    pdfTitle: input.pdfTitle,
    pdfColor: input.pdfColor.toUpperCase(),
    active: input.active,
  };

  let id: string;
  let key: string;
  if (input.id) {
    const [row] = await tx.update(locations).set({ ...values, updatedAt: new Date() }).where(eq(locations.id, input.id)).returning();
    if (!row) return { ok: false, error: "That location isn't there any more." };
    id = row.id;
    key = row.key;
  } else {
    key = keyOf(input.name);
    const [taken] = await tx.select({ id: locations.id }).from(locations).where(eq(locations.key, key));
    if (taken) key = `${key}-${Date.now().toString(36)}`;
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(locations);
    const [row] = await tx.insert(locations).values({ ...values, key, sortOrder: n }).returning();
    id = row.id;
  }

  const keptIds: string[] = [];
  for (const [order, slot] of input.slots.entries()) {
    const slotValues = {
      weekday: slot.weekday,
      startTime: slot.startTime.slice(0, 5),
      endTime: slot.endTime.slice(0, 5),
      pdfDayLabel: slot.pdfDayLabel,
      pdfTimeLabel: slot.pdfTimeLabel,
      active: slot.active,
      sortOrder: order,
    };
    if (slot.id) {
      await tx.update(slots).set({ ...slotValues, updatedAt: new Date() }).where(and(eq(slots.id, slot.id), eq(slots.locationId, id)));
      keptIds.push(slot.id);
    } else {
      let slotKeyValue = slotKey(key, slot.weekday, slot.startTime);
      const [taken] = await tx.select({ id: slots.id }).from(slots).where(and(eq(slots.locationId, id), eq(slots.key, slotKeyValue)));
      if (taken) slotKeyValue = `${slotKeyValue}-${order}`;
      const [row] = await tx.insert(slots).values({ ...slotValues, locationId: id, key: slotKeyValue }).returning({ id: slots.id });
      keptIds.push(row.id);
    }
  }

  // Slots left out of the table: deleted if nothing ever used them, otherwise
  // switched off.
  const dropped = await tx
    .select({ id: slots.id })
    .from(slots)
    .where(keptIds.length > 0 ? and(eq(slots.locationId, id), notInArray(slots.id, keptIds)) : eq(slots.locationId, id));
  if (dropped.length > 0) {
    const ids = dropped.map((row) => row.id);
    const used = await tx.selectDistinct({ id: sessions.slotId }).from(sessions).where(inArray(sessions.slotId, ids));
    const usedIds = new Set(used.map((row) => row.id).filter((slotId): slotId is string => slotId !== null));
    const unused = ids.filter((slotId) => !usedIds.has(slotId));
    if (unused.length > 0) await tx.delete(slots).where(inArray(slots.id, unused));
    if (usedIds.size > 0) await tx.update(slots).set({ active: false }).where(inArray(slots.id, [...usedIds]));
  }

  await audit(tx, { userId, action: input.id ? "update" : "create", entity: "location", entityId: id, diff: { ...values, slots: input.slots.length } });
  return { ok: true, id };
}
