import "server-only";

import { asc, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { locations, slots } from "@/db/schema";

export type LocationWithSlots = typeof locations.$inferSelect & { slots: (typeof slots.$inferSelect)[] };

/** Locations in their sort order, each with its slots in theirs. */
export async function listLocations(): Promise<LocationWithSlots[]> {
  const [places, times] = await Promise.all([
    db().select().from(locations).where(isNull(locations.archivedAt)).orderBy(asc(locations.sortOrder), asc(locations.name)),
    db().select().from(slots).orderBy(asc(slots.sortOrder), asc(slots.startTime)),
  ]);
  return places.map((place) => ({ ...place, slots: times.filter((slot) => slot.locationId === place.id) }));
}
