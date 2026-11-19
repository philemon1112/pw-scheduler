import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SessionActions } from "@/components/member/session-actions";
import { db } from "@/db/client";
import { memberSessions } from "@/db/member-portal";
import { todayInAccra } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { portalMember } from "@/lib/portal";

export const metadata: Metadata = { title: { absolute: "Your session" } };

/** One session, for a link in a message: confirm, or say you can't make it. */
export default async function SessionPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const member = await portalMember(token);
  const session = (await memberSessions(db(), member.id, todayInAccra())).find((s) => s.assignmentId === id);
  if (!session) notFound();

  return (
    <>
      <Link href={`/m/${token}`} className="mb-3 inline-flex min-h-11 items-center gap-2 text-[0.875rem] font-medium text-muted-foreground">
        <ArrowLeft className="size-4" />
        All my sessions
      </Link>
      <article className="rise rounded-2xl border border-border bg-card p-5 shadow-card">
        <h1 className="font-display text-xl font-semibold">
          {new Date(`${session.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
        </h1>
        <p className="tabular mt-1 text-[0.9375rem]">{formatTimeRange(session.startTime, session.endTime)}</p>
        <p className="text-[0.9375rem] text-muted-foreground">{session.location}</p>
        <p className="mt-1 text-[0.9375rem]">{session.partners.length ? `With ${session.partners.join(" & ")}` : "Partner to be confirmed"}</p>
        <div className="mt-4 border-t border-border/70 pt-4">
          <SessionActions token={token} assignmentId={session.assignmentId} confirmed={session.confirmedByMe} requested={session.request?.status === "open"} />
        </div>
      </article>
    </>
  );
}
