import { db } from "@/db/client";
import { memberSessions } from "@/db/member-portal";
import { buildIcs } from "@/lib/calendar";
import { eventFor } from "@/lib/calendar/member-events";
import { portalMember } from "@/lib/portal";

/** One session as a .ics download (§13): `/api/ics/[assignmentId]?t=<member token>`. */
export async function GET(request: Request, { params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  try {
    const member = await portalMember(token);
    const session = (await memberSessions(db(), member.id, "1970-01-01")).find((s) => s.assignmentId === assignmentId);
    if (!session) return new Response("Not found", { status: 404 });
    return new Response(buildIcs([eventFor(session)], { name: "Public witnessing" }), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="public-witnessing-${session.date}.ics"`,
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") return new Response("Too many requests", { status: 429 });
    return new Response("Not found", { status: 404 });
  }
}
