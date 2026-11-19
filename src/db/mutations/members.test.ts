import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import type { MemberInput } from "@/lib/members/input";
import { testDb } from "@/test/pglite";

import { applySeed } from "../seed-apply";
import { auditLog, couples, memberAvailability, members, pairRules, slots, users } from "../schema";

import { saveMember } from "./members";

const raw = JSON.parse(readFileSync(new URL("../../../seed/pw-history-2026.json", import.meta.url), "utf8"));

async function seeded() {
  const { db } = await testDb();
  await applySeed(db, planSeed(raw), raw);
  const [user] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
  const byName = async (name: string) => (await db.select().from(members).where(eq(members.displayName, name)))[0];
  return { db, userId: user.id, byName };
}

const edit = (member: typeof members.$inferSelect, patch: Partial<MemberInput> = {}): MemberInput => ({
  id: member.id,
  title: member.title,
  titleConfirmed: member.titleConfirmed,
  firstName: member.firstName,
  lastName: member.lastName,
  displayName: member.displayName,
  phone: "",
  privilege: member.privilege,
  maxSessionsOverride: null,
  availabilityMode: "flexible",
  slotIds: [],
  preferredLocationId: null,
  notes: "",
  active: true,
  pausedUntil: null,
  alwaysTogether: false,
  partnerId: null,
  neverIds: [],
  unavailable: [],
  ...patch,
});

describe("saving a member", () => {
  it("normalises the phone, saves availability and audits the change", async () => {
    const { db, userId, byName } = await seeded();
    const julia = await byName("Julia Eshun");
    const [slot] = await db.select().from(slots).limit(1);
    const result = await saveMember(db, userId, edit(julia, { phone: "024 123 4567", titleConfirmed: true, availabilityMode: "specific", slotIds: [slot.id], privilege: "regular_pioneer" }));
    expect(result.ok).toBe(true);
    expect(await byName("Julia Eshun")).toMatchObject({ phoneE164: "+233241234567", titleConfirmed: true, privilege: "regular_pioneer", availabilityMode: "specific" });
    expect(await db.select().from(memberAvailability).where(eq(memberAvailability.memberId, julia.id))).toHaveLength(1);
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.entityId, julia.id));
    expect(entry.diff).toMatchObject({ phoneE164: { from: null, to: "+233241234567" } });
  });

  it("refuses a bad phone number and a duplicate name", async () => {
    const { db, userId, byName } = await seeded();
    const julia = await byName("Julia Eshun");
    expect(await saveMember(db, userId, edit(julia, { phone: "12" }))).toMatchObject({ ok: false });
    expect(await saveMember(db, userId, edit(julia, { displayName: "hagar nyarkoa" }))).toMatchObject({ ok: false, error: expect.stringContaining("already called") });
  });

  it("a couple is a Bro and a Sis", async () => {
    const { db, userId, byName } = await seeded();
    const [julia, hagar] = [await byName("Julia Eshun"), await byName("Hagar Nyarkoa")];
    expect(await saveMember(db, userId, edit(julia, { partnerId: hagar.id }))).toEqual({ ok: false, error: "A couple is a Bro and a Sis." });
  });

  it("re-pairing a couple moves the couple and keeps the old sessions", async () => {
    const { db, userId, byName } = await seeded();
    const [love, ruth, arnold] = [await byName("Love Agbanawo"), await byName("Ruth Agbanawo"), await byName("Arnold Boateng")];
    const before = await db.execute<{ n: number }>(sql`select count(*)::int n from assignments`);
    // Ruth paired with Arnold instead (contrived, but it exercises the move).
    expect((await saveMember(db, userId, edit(ruth, { partnerId: arnold.id }))).ok).toBe(true);
    const rows = await db.select().from(couples);
    expect(rows).toHaveLength(6);
    expect(rows.some((c) => [c.memberAId, c.memberBId].includes(love.id))).toBe(false);
    expect(rows.find((c) => [c.memberAId, c.memberBId].includes(ruth.id))?.displayLabel).toBe("Bro & Sis Boateng");
    const after = await db.execute<{ n: number }>(sql`select count(*)::int n from assignments`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("never-pair rules are stored once per pair, sorted", async () => {
    const { db, userId, byName } = await seeded();
    const [julia, hagar] = [await byName("Julia Eshun"), await byName("Hagar Nyarkoa")];
    await saveMember(db, userId, edit(julia, { neverIds: [hagar.id] }));
    await saveMember(db, userId, edit(hagar, { neverIds: [julia.id] }));
    const rules = await db.select().from(pairRules);
    expect(rules).toHaveLength(1);
    expect(rules[0].memberAId < rules[0].memberBId).toBe(true);
  });

  it("creates a new member", async () => {
    const { db, userId, byName } = await seeded();
    const julia = await byName("Julia Eshun");
    const result = await saveMember(db, userId, { ...edit(julia), id: null, firstName: "Ama", lastName: "Mensah", displayName: "Ama Mensah" });
    expect(result.ok).toBe(true);
    expect(await byName("Ama Mensah")).toMatchObject({ gender: "F", title: "Sis" });
  });
});
