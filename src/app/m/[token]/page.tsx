import type { Metadata } from "next";
import Link from "next/link";
import { CalendarPlus, CalendarSync, Download, SlidersHorizontal } from "lucide-react";

import { SessionActions } from "@/components/member/session-actions";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { memberSessions } from "@/db/member-portal";
import { shortDate, todayInAccra } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { googleCalendarLink } from "@/lib/calendar";
import { eventFor } from "@/lib/calendar/member-events";
import { portalMember } from "@/lib/portal";
import { appUrl } from "@/lib/tokens";

export const metadata: Metadata = { title: { absolute: "Your public witnessing sessions" } };

/** A member's own page (§10, public): their upcoming sessions, calendar buttons, confirm or can't make it. */
export default async function MemberPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await portalMember(token);
  const sessions = await memberSessions(db(), member.id, todayInAccra());
  const feed = `${appUrl()}/api/cal/${token}.ics`;
  const webcal = feed.replace(/^https?:\/\//, "webcal://");

  return (
    <>
      <h1 className="rise font-display text-[1.75rem] leading-tight font-bold tracking-tight">
        {member.title} {member.displayName}
      </h1>
      <p className="rise mt-1 text-[0.9375rem] text-muted-foreground">Your upcoming sessions.</p>

      <div className="mt-5 grid gap-3">
        {sessions.length === 0 ? (
          <p className="rise rounded-2xl border border-dashed border-border bg-card/60 p-5 text-[0.9375rem] text-muted-foreground">
            Nothing booked yet. Once the next month&apos;s schedule is out, your sessions show here.
          </p>
        ) : (
          sessions.map((s, i) => {
            const event = eventFor(s);
            return (
              <article key={s.assignmentId} className="rise rounded-2xl border border-border bg-card p-4 shadow-card" style={{ animationDelay: `${i * 40}ms` }}>
                <p className="font-display text-lg font-semibold">
                  {new Date(`${s.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                </p>
                <p className="tabular text-[0.9375rem]">
                  {formatTimeRange(s.startTime, s.endTime)}
                  {s.moved && s.specialDayName ? <span className="text-accent-foreground"> · moved for {s.specialDayName}</span> : null}
                </p>
                <p className="mt-1 text-[0.9375rem] text-muted-foreground">{s.location}</p>
                <p className="mt-1 text-[0.9375rem]">{s.partners.length ? `With ${s.partners.join(" & ")}` : "Partner to be confirmed"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <a href={googleCalendarLink(event)} target="_blank" rel="noopener noreferrer">
                      <CalendarPlus />
                      Google Calendar
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/ics/${s.assignmentId}?t=${token}`} download>
                      <Download />
                      Apple / Outlook (.ics)
                    </a>
                  </Button>
                </div>
                <div className="mt-3 border-t border-border/70 pt-3">
                  <SessionActions token={token} assignmentId={s.assignmentId} confirmed={s.confirmedByMe} requested={s.request?.status === "open"} />
                </div>
              </article>
            );
          })
        )}
      </div>

      <section className="rise mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <h2 className="font-display text-base font-semibold">Keep your calendar up to date</h2>
        <p className="text-[0.875rem] text-muted-foreground">Subscribe once and new months appear by themselves in your phone&apos;s calendar.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a href={webcal}>
              <CalendarSync />
              Subscribe
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">
              Add to Google Calendar
            </a>
          </Button>
        </div>
      </section>

      <Link href={`/m/${token}/availability`} className="rise mt-4 flex min-h-12 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
        <SlidersHorizontal className="size-4 text-primary" />
        <span className="grow">
          <span className="block text-[0.9375rem] font-medium">My availability</span>
          <span className="block text-[0.8125rem] text-muted-foreground">Which slots suit you, and dates you&apos;re away</span>
        </span>
      </Link>
      <p className="mt-6 text-center text-[0.75rem] text-muted-foreground">This link is just for you. Updated {shortDate(todayInAccra())}.</p>
    </>
  );
}
