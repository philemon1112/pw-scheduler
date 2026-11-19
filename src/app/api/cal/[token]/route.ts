import { db } from "@/db/client";
import { memberSessions } from "@/db/member-portal";
import { addDays, todayInAccra } from "@/lib/dates/calendar";
import { buildIcs } from "@/lib/calendar";
import { eventFor } from "@/lib/calendar/member-events";
import { portalMember } from "@/lib/portal";

/**
 * A member's subscribe feed (§13): `/api/cal/<token>.ics`. Their published
 * sessions from a month back onwards, with stable UIDs, so calendar apps
 * update events in place as months are published and pairs change.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/, "");
  try {
    const member = await portalMember(token);
    const sessions = await memberSessions(db(), member.id, addDays(todayInAccra(), -31));
    return new Response(buildIcs(sessions.map(eventFor), { name: `Public witnessing – ${member.title} ${member.displayName}` }), {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "X-Robots-Tag": "noindex" },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") return new Response("Too many requests", { status: 429 });
    return new Response("Not found", { status: 404 });
  }
}
