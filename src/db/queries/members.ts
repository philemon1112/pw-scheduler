import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import {
  assignments,
  couples,
  locations,
  memberAvailability,
  members,
  memberUnavailableDates,
  pairRules,
  schedules,
  sessions,
} from "@/db/schema";
import type { MemberInput } from "@/lib/members/input";

export interface MemberRow extends Omit<MemberInput, "id" | "phone"> {
  id: string;
  phoneE164: string | null;
  hasLink: boolean;
  coupleLabel: string | null;
  /** This month, from whatever schedule the month has (draft, published or imported). */
  month: { sessions: number; partners: string[]; locationKeys: string[] };
}

/**
 * Everyone on the rota, with everything the Members screen shows and the
 * editor needs — one round of queries rather than one per person.
 */
export async function listMembers(month: string): Promise<MemberRow[]> {
  const [people, pairs, available, away, never, booked] = await Promise.all([
    db().select().from(members).where(isNull(members.archivedAt)).orderBy(asc(members.displayName)),
    db().select().from(couples),
    db().select().from(memberAvailability),
    db().select().from(memberUnavailableDates).orderBy(asc(memberUnavailableDates.startDate)),
    db().select().from(pairRules).where(eq(pairRules.rule, "never")),
    db()
      .select({ memberIds: assignments.memberIds, locationKey: locations.key })
      .from(assignments)
      .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
      .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
      .innerJoin(locations, eq(locations.id, sessions.locationId))
      .where(and(eq(schedules.month, month), eq(sessions.isCancelled, false))),
  ]);

  const nameOf = new Map(people.map((p) => [p.id, p.displayName]));
  const stats = new Map<string, { sessions: number; partners: Set<string>; locations: Set<string> }>();
  for (const row of booked) {
    for (const id of row.memberIds) {
      const entry = stats.get(id) ?? { sessions: 0, partners: new Set(), locations: new Set() };
      entry.sessions += 1;
      entry.locations.add(row.locationKey);
      for (const other of row.memberIds) if (other !== id) entry.partners.add(nameOf.get(other) ?? "Someone removed");
      stats.set(id, entry);
    }
  }

  return people.map((person) => {
    const couple = pairs.find((c) => c.memberAId === person.id || c.memberBId === person.id);
    const stat = stats.get(person.id);
    return {
      id: person.id,
      title: person.title,
      titleConfirmed: person.titleConfirmed,
      firstName: person.firstName,
      lastName: person.lastName,
      displayName: person.displayName,
      phoneE164: person.phoneE164,
      privilege: person.privilege,
      maxSessionsOverride: person.maxSessionsOverride,
      availabilityMode: person.availabilityMode,
      slotIds: available.filter((a) => a.memberId === person.id).map((a) => a.slotId),
      preferredLocationId: person.preferredLocationId,
      notes: person.notes ?? "",
      active: person.active,
      pausedUntil: person.pausedUntil,
      partnerId: couple ? (couple.memberAId === person.id ? couple.memberBId : couple.memberAId) : null,
      coupleLabel: couple?.displayLabel ?? null,
      alwaysTogether: couple?.alwaysTogether ?? false,
      neverIds: never.filter((r) => r.memberAId === person.id || r.memberBId === person.id).map((r) => (r.memberAId === person.id ? r.memberBId : r.memberAId)),
      unavailable: away.filter((a) => a.memberId === person.id).map((a) => ({ start: a.startDate, end: a.endDate, reason: a.reason ?? "" })),
      hasLink: Boolean(person.publicTokenHash),
      month: {
        sessions: stat?.sessions ?? 0,
        partners: [...(stat?.partners ?? [])].sort(),
        locationKeys: [...(stat?.locations ?? [])].sort(),
      },
    };
  });
}
