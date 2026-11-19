import { db } from "@/db/client";
import * as t from "@/db/schema";
import { currentUser } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { todayInAccra } from "@/lib/dates/calendar";

/**
 * "Export everything" as JSON (§10.7): every table a backup needs, without
 * secrets — no password hashes, invite or member-link tokens, or the
 * rate-limit counters.
 */
export async function GET() {
  const user = await currentUser();
  if (!user || !hasRole(user, "owner")) return new Response("Not found", { status: 404 });
  const d = db();
  const [settings, locations, slots, members, couples, availability, away, confirmations, pairRules, specialDays, schedules, sessions, assignments, swapRequests, templates, messageLog, printLayouts, users, audit, imports] =
    await Promise.all([
      d.select().from(t.settings),
      d.select().from(t.locations),
      d.select().from(t.slots),
      d.select().from(t.members),
      d.select().from(t.couples),
      d.select().from(t.memberAvailability),
      d.select().from(t.memberUnavailableDates),
      d.select().from(t.memberMonthConfirmations),
      d.select().from(t.pairRules),
      d.select().from(t.specialDayRules),
      d.select().from(t.schedules),
      d.select().from(t.sessions),
      d.select().from(t.assignments),
      d.select().from(t.swapRequests),
      d.select().from(t.messageTemplates),
      d.select().from(t.messageLog),
      d.select().from(t.printLayouts),
      d.select({ id: t.users.id, email: t.users.email, name: t.users.name, role: t.users.role, createdAt: t.users.createdAt, disabledAt: t.users.disabledAt }).from(t.users),
      d.select().from(t.auditLog),
      d.select({ id: t.importBatches.id, sourceFilename: t.importBatches.sourceFilename, month: t.importBatches.month, createdAt: t.importBatches.createdAt }).from(t.importBatches),
    ]);
  const body = {
    exportedAt: new Date().toISOString(),
    app: "pw-scheduler",
    settings,
    locations,
    slots,
    members: members.map((m) => Object.fromEntries(Object.entries(m).filter(([key]) => key !== "publicTokenHash" && key !== "publicTokenEnc"))),
    couples,
    availability,
    away,
    confirmations,
    pairRules,
    specialDays,
    schedules,
    sessions,
    assignments,
    swapRequests,
    templates,
    messageLog,
    printLayouts,
    users,
    audit,
    imports,
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pw-scheduler-export-${todayInAccra()}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
