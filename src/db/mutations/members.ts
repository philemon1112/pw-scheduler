import { and, eq, inArray, or, sql } from "drizzle-orm";

import { normalisePhone } from "@/lib/members/phone";
import type { MemberInput } from "@/lib/members/input";

import { audit, changes } from "../audit";
import {
  assignments,
  couples,
  memberAvailability,
  members,
  memberUnavailableDates,
  pairRules,
} from "../schema";
import type { AnyDb } from "../types";

export type SaveMemberResult = { ok: true; id: string } | { ok: false; error: string };

const sorted = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];

/**
 * Create or update a member and everything hanging off them: availability,
 * away dates, their couple and their never-pair list. Run inside a
 * transaction, so a member is never left half-saved.
 *
 * The rule from D14 is enforced here, not only in the form: a couple is a Bro
 * and a Sis.
 */
export async function saveMember(tx: AnyDb, userId: string, input: MemberInput): Promise<SaveMemberResult> {
  let phoneE164: string | null = null;
  if (input.phone) {
    const phone = normalisePhone(input.phone);
    if (!phone.ok) return { ok: false, error: phone.error };
    phoneE164 = phone.e164;
  }

  // Same display name, any case, on someone else.
  const [clash] = await tx
    .select({ id: members.id })
    .from(members)
    .where(sql`lower(${members.displayName}) = lower(${input.displayName}) and ${members.id} is distinct from ${input.id}`)
    .limit(1);
  if (clash) return { ok: false, error: `Someone is already called ${input.displayName}. Add something to tell them apart.` };

  let partner: { id: string; title: "Bro" | "Sis"; lastName: string } | undefined;
  if (input.partnerId) {
    [partner] = await tx.select({ id: members.id, title: members.title, lastName: members.lastName }).from(members).where(eq(members.id, input.partnerId));
    if (!partner) return { ok: false, error: "That partner isn't on the list any more." };
    if (partner.title === input.title) return { ok: false, error: "A couple is a Bro and a Sis." };
  }

  const values = {
    title: input.title,
    titleConfirmed: input.titleConfirmed,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: input.displayName,
    gender: input.title === "Bro" ? ("M" as const) : ("F" as const),
    phoneE164,
    privilege: input.privilege,
    maxSessionsOverride: input.maxSessionsOverride,
    availabilityMode: input.availabilityMode,
    preferredLocationId: input.preferredLocationId,
    notes: input.notes || null,
    active: input.active,
    pausedUntil: input.pausedUntil,
  };

  let id: string;
  if (input.id) {
    const [before] = await tx.select().from(members).where(eq(members.id, input.id));
    if (!before) return { ok: false, error: "That member isn't on the list any more." };
    await tx.update(members).set({ ...values, updatedAt: new Date() }).where(eq(members.id, input.id));
    id = input.id;
    await audit(tx, { userId, action: "update", entity: "member", entityId: id, diff: changes(before, values) });
  } else {
    const [created] = await tx.insert(members).values(values).returning({ id: members.id });
    id = created.id;
    await audit(tx, { userId, action: "create", entity: "member", entityId: id, diff: { displayName: input.displayName } });
  }

  // Availability and away dates: replaced as a set.
  await tx.delete(memberAvailability).where(eq(memberAvailability.memberId, id));
  if (input.slotIds.length > 0) {
    await tx.insert(memberAvailability).values([...new Set(input.slotIds)].map((slotId) => ({ memberId: id, slotId })));
  }
  await tx.delete(memberUnavailableDates).where(eq(memberUnavailableDates.memberId, id));
  if (input.unavailable.length > 0) {
    await tx
      .insert(memberUnavailableDates)
      .values(input.unavailable.map((range) => ({ memberId: id, startDate: range.start, endDate: range.end, reason: range.reason || null })));
  }

  // The couple: only touched when it changes, because a couple that served
  // together is referenced by its history.
  const current = await tx
    .select()
    .from(couples)
    .where(or(eq(couples.memberAId, id), eq(couples.memberBId, id)));
  const currentPartner = current[0] ? (current[0].memberAId === id ? current[0].memberBId : current[0].memberAId) : null;
  if (currentPartner !== (input.partnerId ?? null)) {
    const involved = [id, ...(input.partnerId ? [input.partnerId] : [])];
    const stale = await tx
      .select({ id: couples.id })
      .from(couples)
      .where(or(inArray(couples.memberAId, involved), inArray(couples.memberBId, involved)));
    if (stale.length > 0) {
      const ids = stale.map((row) => row.id);
      // Past sessions stay; they just stop counting as "a couple served".
      await tx.update(assignments).set({ coupleId: null }).where(inArray(assignments.coupleId, ids));
      await tx.delete(couples).where(inArray(couples.id, ids));
    }
    if (partner) {
      const [a, b] = sorted(id, partner.id);
      const husband = input.title === "Bro" ? input.lastName : partner.lastName;
      await tx.insert(couples).values({ memberAId: a, memberBId: b, displayLabel: `Bro & Sis ${husband}`.trim(), alwaysTogether: input.alwaysTogether });
    }
    await audit(tx, { userId, action: "couple", entity: "member", entityId: id, diff: { from: currentPartner, to: input.partnerId } });
  } else if (current[0] && current[0].alwaysTogether !== input.alwaysTogether) {
    await tx.update(couples).set({ alwaysTogether: input.alwaysTogether }).where(eq(couples.id, current[0].id));
    await audit(tx, { userId, action: "update", entity: "couple", entityId: current[0].id, diff: { alwaysTogether: input.alwaysTogether } });
  }

  // Never-pair rules involving this member: replaced as a set.
  await tx.delete(pairRules).where(and(eq(pairRules.rule, "never"), or(eq(pairRules.memberAId, id), eq(pairRules.memberBId, id))));
  const others = [...new Set(input.neverIds)].filter((other) => other !== id);
  if (others.length > 0) {
    await tx.insert(pairRules).values(
      others.map((other) => {
        const [a, b] = sorted(id, other);
        return { memberAId: a, memberBId: b, rule: "never" as const };
      })
    ).onConflictDoUpdate({ target: [pairRules.memberAId, pairRules.memberBId], set: { rule: "never" } });
  }

  return { ok: true, id };
}
