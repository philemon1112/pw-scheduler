import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { requirePageRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Activity" };

const ACTIONS: Record<string, string> = {
  bootstrap_owner: "Set up the owner account",
  generate: "Generated a month",
  publish: "Published a month",
  unpublish: "Moved a month back to draft",
  swap: "Swapped two sessions",
  lock: "Locked a session",
  unlock: "Unlocked a session",
  update: "Changed",
  create: "Added",
  archive: "Archived",
  couple: "Changed a couple",
  link_created: "Made a private link",
  link_revoked: "Revoked a private link",
  import: "Imported a sheet",
  invite: "Invited someone",
  invite_renewed: "Made a new invite link",
  invite_accepted: "Accepted an invite",
  role: "Changed a role",
  user_removed: "Removed an account",
  user_restored: "Restored an account",
  password_changed: "Changed their password",
  member_confirmed: "Confirmed a session",
  member_declined: "Said they can't make it",
  member_availability: "Updated their availability",
  swap_rejected: "Kept someone after a request",
  reset: "Reset",
};

const summary = (diff: unknown) => {
  if (!diff || typeof diff !== "object") return "";
  return Object.entries(diff as Record<string, unknown>)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? (Array.isArray(v) ? `${v.length} items` : "…") : String(v).slice(0, 40)}`)
    .join(" · ");
};

/** The audit log (§14), newest first: who did what, when. Owner only. */
export default async function ActivityPage() {
  await requirePageRole("owner", "/settings");
  const rows = await db()
    .select({ log: auditLog, name: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(300);
  return (
    <>
      <PageHeader title="Activity" description="The last 300 changes: publishing, swaps, imports, member edits and sign-ins set up." />
      <ol className="rise grid gap-1 rounded-2xl border border-border bg-card p-2 shadow-card">
        {rows.length === 0 ? <li className="p-3 text-[0.8125rem] text-muted-foreground">Nothing yet.</li> : null}
        {rows.map(({ log, name }) => (
          <li key={log.id} className="grid gap-0.5 rounded-xl px-3 py-2 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-3">
            <span className="tabular text-[0.75rem] text-muted-foreground">
              {log.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" })}
            </span>
            <span className="min-w-0 text-[0.8125rem]">
              <span className="font-medium">{name ?? "A member, from their link"}</span> · {ACTIONS[log.action] ?? log.action} <span className="text-muted-foreground">({log.entity.replace(/_/g, " ")})</span>
              {summary(log.diff) ? <span className="block truncate text-[0.75rem] text-muted-foreground">{summary(log.diff)}</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
