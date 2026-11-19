import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { UsersView, type UserRow } from "@/components/settings/users-view";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requirePageRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Users and invites" };

export default async function UsersPage() {
  const owner = await requirePageRole("owner", "/settings");
  const rows = await db()
    .select({ u: users, expired: sql<boolean>`coalesce(${users.inviteExpiresAt} < now(), true)` })
    .from(users)
    .orderBy(asc(users.createdAt));
  const list: UserRow[] = rows.map(({ u, expired }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    state: u.disabledAt ? "removed" : u.inviteTokenHash ? (expired ? "expired" : "invited") : "active",
    lastLogin: u.lastLoginAt ? u.lastLoginAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" }) : null,
  }));
  return (
    <>
      <PageHeader title="Users and invites" description="Who can open the app. Members don't need accounts — they use their private links." />
      <UsersView users={list} selfId={owner.id} />
    </>
  );
}
