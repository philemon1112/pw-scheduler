import type { PortalSession } from "@/db/member-portal";

import { type CalendarEvent } from "./index";

/** A member's session as a calendar event: who they're with, and why the time moved if it did. */
export function eventFor(session: PortalSession): CalendarEvent {
  const partner = session.partners.length ? `With ${session.partners.join(" & ")}` : "Partner to be confirmed";
  const moved = session.moved && session.specialDayName ? ` · Time moved for ${session.specialDayName}` : "";
  return {
    uid: `${session.assignmentId}@pw-scheduler`,
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    title: `Public witnessing – ${session.location}`,
    location: session.location,
    description: `${partner}${moved}`,
    updatedAt: session.updatedAt,
  };
}
