import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hasRole } from "@/lib/auth/roles";
import type { Role } from "@/types/next-auth";

export { hasRole };

/**
 * The real access check, made next to the data (§14). Server actions are
 * reachable by direct POST, so a hidden button protects nothing — every page
 * and action calls one of these.
 */
export type SessionUser = { id: string; email: string; name: string; role: Role };

/**
 * The signed-in user, read fresh from the database once per request: a
 * session is a 30-day JWT, so without this a removed account or a changed
 * role would keep working until the token expired.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [row] = await db().select({ id: users.id, email: users.email, name: users.name, role: users.role, disabledAt: users.disabledAt }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!row || row.disabledAt) return null;
  return { id: row.id, email: row.email, name: row.name, role: row.role };
});

/** For pages: no session means the sign-in screen. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions: throws, so a forbidden write never runs. */
export async function requireRole(needed: Role): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new Error("Not signed in.");
  if (!hasRole(user, needed)) throw new Error("You don't have permission to do that.");
  return user;
}

/** For pages that need a role: anyone signed in without it goes to `fallback`, not an error. */
export async function requirePageRole(needed: Role, fallback = "/schedule"): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user, needed)) redirect(fallback);
  return user;
}
