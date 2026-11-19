import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { hashToken, newToken } from "@/lib/tokens";

import { audit } from "../audit";
import { users } from "../schema";
import type { AnyDb } from "../types";

/** A refusal with a message for the person. */
export class UserError extends Error {}

const INVITE_DAYS = 7;

export const InviteInput = z.object({
  name: z.string().trim().min(1, "Enter their name.").max(120),
  email: z.string().trim().toLowerCase().email("That email doesn't look right.").max(320),
  role: z.enum(["editor", "viewer"]),
});

const expiry = () => new Date(Date.now() + INVITE_DAYS * 86_400_000);

/**
 * Invite-only accounts (§2): the owner adds someone and gets a one-time link
 * to send them. Until they open it and choose a password the account can't
 * sign in. The link is stored as a hash and lasts 7 days.
 */
export async function inviteUser(tx: AnyDb, ownerId: string, input: z.infer<typeof InviteInput>): Promise<{ id: string; token: string }> {
  const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (existing) throw new UserError("Someone with that email already has an account.");
  const token = newToken();
  const [row] = await tx
    .insert(users)
    .values({
      email: input.email,
      name: input.name,
      role: input.role,
      // Unusable until the invite is accepted: a real hash of nothing anyone knows.
      passwordHash: await hashPassword(newToken()),
      invitedBy: ownerId,
      inviteTokenHash: hashToken(token),
      inviteExpiresAt: expiry(),
    })
    .returning({ id: users.id });
  await audit(tx, { userId: ownerId, action: "invite", entity: "user", entityId: row.id, diff: { email: input.email, role: input.role } });
  return { id: row.id, token };
}

/** A fresh link for an invite that was lost or ran out. */
export async function renewInvite(tx: AnyDb, ownerId: string, userId: string): Promise<string> {
  const token = newToken();
  const [row] = await tx
    .update(users)
    .set({ inviteTokenHash: hashToken(token), inviteExpiresAt: expiry(), updatedAt: sql`now()` })
    .where(and(eq(users.id, userId), sql`${users.inviteTokenHash} is not null`))
    .returning({ id: users.id });
  if (!row) throw new UserError("That person has already set up their account.");
  await audit(tx, { userId: ownerId, action: "invite_renewed", entity: "user", entityId: userId });
  return token;
}

export async function inviteFor(tx: AnyDb, token: string) {
  const [row] = await tx
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.inviteTokenHash, hashToken(token)), gt(users.inviteExpiresAt, sql`now()`), isNull(users.disabledAt)))
    .limit(1);
  return row ?? null;
}

/** The invited person chooses their password; the link stops working. */
export async function acceptInvite(tx: AnyDb, token: string, password: string) {
  const problem = passwordProblem(password);
  if (problem) throw new UserError(problem);
  const invite = await inviteFor(tx, token);
  if (!invite) throw new UserError("This invite link has expired or was already used. Ask for a new one.");
  await tx.update(users).set({ passwordHash: await hashPassword(password), inviteTokenHash: null, inviteExpiresAt: null, updatedAt: sql`now()` }).where(eq(users.id, invite.id));
  await audit(tx, { userId: invite.id, action: "invite_accepted", entity: "user", entityId: invite.id });
  return invite;
}

export async function setUserRole(tx: AnyDb, ownerId: string, userId: string, role: "editor" | "viewer") {
  if (userId === ownerId) throw new UserError("You can't change your own role.");
  const [row] = await tx.update(users).set({ role, updatedAt: sql`now()` }).where(and(eq(users.id, userId), ne(users.role, "owner"))).returning({ id: users.id });
  if (!row) throw new UserError("That account can't be changed.");
  await audit(tx, { userId: ownerId, action: "role", entity: "user", entityId: userId, diff: { role } });
}

/** Removing someone keeps their account (and its audit trail) but stops it working at once. */
export async function setUserDisabled(tx: AnyDb, ownerId: string, userId: string, disabled: boolean) {
  if (userId === ownerId) throw new UserError("You can't remove your own account.");
  const [row] = await tx
    .update(users)
    .set({ disabledAt: disabled ? new Date() : null, updatedAt: sql`now()` })
    .where(and(eq(users.id, userId), ne(users.role, "owner")))
    .returning({ id: users.id });
  if (!row) throw new UserError("That account can't be changed.");
  await audit(tx, { userId: ownerId, action: disabled ? "user_removed" : "user_restored", entity: "user", entityId: userId });
}

export async function changePassword(tx: AnyDb, userId: string, current: string, next: string) {
  const problem = passwordProblem(next);
  if (problem) throw new UserError(problem);
  const [row] = await tx.select({ hash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!row || !(await verifyPassword(current, row.hash))) throw new UserError("Your current password isn't right.");
  await tx.update(users).set({ passwordHash: await hashPassword(next), updatedAt: sql`now()` }).where(eq(users.id, userId));
  await audit(tx, { userId, action: "password_changed", entity: "user", entityId: userId });
}
