import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { hasRole } from "@/lib/auth/roles";
import type { Role } from "@/types/next-auth";

export { hasRole };

/**
 * The real access check, made next to the data (§14). Server actions are
 * reachable by direct POST, so a hidden button protects nothing — every page
 * and action calls one of these.
 */
export type SessionUser = { id: string; email: string; name: string; role: Role };

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role,
  };
}

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
