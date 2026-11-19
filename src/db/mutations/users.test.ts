import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { verifyPassword } from "@/lib/auth/password";
import { testDb } from "@/test/pglite";

import { users } from "../schema";

import { acceptInvite, changePassword, inviteFor, inviteUser, renewInvite, setUserDisabled, setUserRole, UserError } from "./users";

async function withOwner() {
  const { db } = await testDb();
  const [owner] = await db.insert(users).values({ email: "o@example.com", name: "Owner", passwordHash: "x", role: "owner" }).returning();
  return { db, owner };
}

describe("users and invites", () => {
  it("invites someone who can only sign in after choosing a password", async () => {
    const { db, owner } = await withOwner();
    const { id, token } = await inviteUser(db, owner.id, { name: "Ama", email: "ama@example.com", role: "editor" });
    const [pending] = await db.select().from(users).where(eq(users.id, id));
    expect(pending.inviteTokenHash).toHaveLength(64);
    expect(pending.inviteTokenHash).not.toBe(token);
    expect((await inviteFor(db, token))?.email).toBe("ama@example.com");

    await expect(acceptInvite(db, token, "short")).rejects.toThrow(UserError);
    await acceptInvite(db, token, "a-long-enough-password");
    const [done] = await db.select().from(users).where(eq(users.id, id));
    expect(done.inviteTokenHash).toBeNull();
    expect(await verifyPassword("a-long-enough-password", done.passwordHash)).toBe(true);
    // The link works once.
    await expect(acceptInvite(db, token, "another-long-password")).rejects.toThrow(/expired or was already used/);
    await expect(renewInvite(db, owner.id, id)).rejects.toThrow(UserError);
  }, 120_000);

  it("refuses a duplicate email, and lets the owner change roles and remove people but not themselves", async () => {
    const { db, owner } = await withOwner();
    const { id } = await inviteUser(db, owner.id, { name: "Kofi", email: "kofi@example.com", role: "viewer" });
    await expect(inviteUser(db, owner.id, { name: "Kofi", email: "KOFI@example.com".toLowerCase(), role: "viewer" })).rejects.toThrow(/already has an account/);
    await setUserRole(db, owner.id, id, "editor");
    await setUserDisabled(db, owner.id, id, true);
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(row.role).toBe("editor");
    expect(row.disabledAt).not.toBeNull();
    await expect(setUserDisabled(db, owner.id, owner.id, true)).rejects.toThrow(/own account/);
    await expect(setUserRole(db, owner.id, owner.id, "viewer")).rejects.toThrow(/own role/);
  }, 120_000);

  it("changes a password only with the current one", async () => {
    const { db, owner } = await withOwner();
    const { id, token } = await inviteUser(db, owner.id, { name: "Ama", email: "ama@example.com", role: "editor" });
    await acceptInvite(db, token, "first-password-123");
    await expect(changePassword(db, id, "wrong-password", "second-password-123")).rejects.toThrow(/current password/);
    await changePassword(db, id, "first-password-123", "second-password-123");
    const [row] = await db.select().from(users).where(eq(users.id, id));
    expect(await verifyPassword("second-password-123", row.passwordHash)).toBe(true);
  }, 120_000);
});
