import { readFileSync } from "node:fs";

import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import { hashToken, newToken } from "@/lib/tokens";
import { testDb } from "@/test/pglite";

import { availabilityFor, confirmSession, declineSession, memberForToken, memberSessions, saveAvailability } from "./member-portal";
import { generateMonth, setCell, setScheduleStatus } from "./mutations/schedule";
import { applySeed } from "./seed-apply";
import { assignments, memberAvailability, members, schedules, sessions, slots, swapRequests, users } from "./schema";

const raw = JSON.parse(readFileSync(new URL("../../seed/pw-history-2026.json", import.meta.url), "utf8"));

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-member-portal-0123";
});

async function published() {
  const { db } = await testDb();
  await applySeed(db, planSeed(raw), raw);
  const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
  await generateMonth(db, user.id, "2026-12", 9);
  await setScheduleStatus(db, user.id, "2026-12", "published");
  // Someone with a December session, given a link.
  const [first] = await db
    .select({ assignment: assignments })
    .from(assignments)
    .innerJoin(sessions, eq(sessions.id, assignments.sessionId))
    .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
    .where(and(eq(schedules.month, "2026-12"), sql`cardinality(${assignments.memberIds}) = 2`))
    .limit(1);
  const memberId = first.assignment.memberIds[0];
  const token = newToken();
  await db.update(members).set({ publicTokenHash: hashToken(token) }).where(eq(members.id, memberId));
  return { db, user, memberId, token, assignment: first.assignment };
}

describe("a member's private page", () => {
  it("finds the member by their link, and nobody by a wrong or malformed one", async () => {
    const { db, memberId, token } = await published();
    expect((await memberForToken(db, token))?.id).toBe(memberId);
    expect(await memberForToken(db, newToken())).toBeNull();
    expect(await memberForToken(db, "not-a-token")).toBeNull();
  });

  it("shows only their own published sessions, with their partner's name and nothing else", async () => {
    const { db, memberId } = await published();
    const mine = await memberSessions(db, memberId, "2026-12-01");
    expect(mine.length).toBeGreaterThan(0);
    for (const s of mine) {
      expect(s.partners.every((p) => /^(Bro|Sis) /.test(p))).toBe(true);
      expect(JSON.stringify(s)).not.toMatch(/\+233|phone/i);
    }
    // November is imported (archived), not published: not shown.
    expect(await memberSessions(db, memberId, "2026-11-01")).toEqual(mine);
  });

  it("confirms, and becomes confirmed once both partners have", async () => {
    const { db, memberId, assignment } = await published();
    expect(await confirmSession(db, memberId, assignment.id)).toBe(true);
    let [row] = await db.select().from(assignments).where(eq(assignments.id, assignment.id));
    expect(row).toMatchObject({ status: "pending", confirmedMemberIds: [memberId] });
    await confirmSession(db, assignment.memberIds[1], assignment.id);
    [row] = await db.select().from(assignments).where(eq(assignments.id, assignment.id));
    expect(row.status).toBe("confirmed");
  });

  it("can't touch someone else's session", async () => {
    const { db, memberId, assignment } = await published();
    const [other] = await db.select().from(assignments).where(sql`not (${assignments.memberIds} @> array[${memberId}]::uuid[])`).limit(1);
    expect(await confirmSession(db, memberId, other.id)).toBe(false);
    expect(await declineSession(db, memberId, other.id, "x")).toBe(false);
    expect(await declineSession(db, memberId, assignment.id, "Travelling")).toBe(true);
  });

  it("“I can't make it” opens a request with suggestions, and replacing them closes it", async () => {
    const { db, user, memberId, assignment } = await published();
    await declineSession(db, memberId, assignment.id, "Travelling that weekend");
    await declineSession(db, memberId, assignment.id, "Twice"); // no duplicate
    const requests = await db.select().from(swapRequests);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ status: "open", reason: "Travelling that weekend" });
    expect(Array.isArray(requests[0].suggestedMemberIds)).toBe(true);
    expect((await db.select().from(assignments).where(eq(assignments.id, assignment.id)))[0].status).toBe("declined");

    const partner = assignment.memberIds[1];
    const replacement = requests[0].suggestedMemberIds?.[0];
    await setCell(db, user.id, assignment.sessionId, replacement ? [replacement, partner] : [partner]);
    const [after] = await db.select().from(swapRequests);
    expect(after).toMatchObject({ status: "approved", resolvedBy: user.id });
  });

  it("saves their availability, ignoring slots that don't exist", async () => {
    const { db, memberId } = await published();
    const [slot] = await db.select().from(slots).limit(1);
    await saveAvailability(
      db,
      memberId,
      { mode: "specific", slotIds: [slot.id, "00000000-0000-4000-8000-000000000000"], away: [{ start: "2027-01-10", end: "2027-01-12", reason: "Funeral" }], confirmMonths: ["2027-01"] },
      ["2027-01"]
    );
    const saved = await availabilityFor(db, memberId, ["2027-01"]);
    expect(saved).toEqual({ slotIds: [slot.id], away: [{ start: "2027-01-10", end: "2027-01-12", reason: "Funeral" }], confirmedMonths: ["2027-01"] });
    expect(await db.select().from(memberAvailability).where(eq(memberAvailability.memberId, memberId))).toHaveLength(1);
  });
});
