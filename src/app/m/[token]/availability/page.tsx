import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AvailabilityForm } from "@/components/member/availability-form";
import { db } from "@/db/client";
import { availabilityFor } from "@/db/member-portal";
import { listLocations } from "@/db/queries/locations";
import { monthLabel, WEEKDAY_NAMES } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { portalMember } from "@/lib/portal";

import { confirmableMonths } from "../actions";

export const metadata: Metadata = { title: { absolute: "Your availability" } };

export default async function AvailabilityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await portalMember(token);
  const months = await confirmableMonths();
  const [current, places] = await Promise.all([availabilityFor(db(), member.id, months), listLocations()]);
  const groups = places
    .filter((p) => p.active)
    .map((p) => ({ location: p.name, slots: p.slots.filter((s) => s.active).map((s) => ({ id: s.id, label: `${WEEKDAY_NAMES[s.weekday]} · ${formatTimeRange(s.startTime, s.endTime)}` })) }))
    .filter((g) => g.slots.length > 0);

  return (
    <>
      <Link href={`/m/${token}`} className="mb-3 inline-flex min-h-11 items-center gap-2 text-[0.875rem] font-medium text-muted-foreground">
        <ArrowLeft className="size-4" />
        My sessions
      </Link>
      <h1 className="rise mb-5 font-display text-[1.75rem] leading-tight font-bold tracking-tight">Your availability</h1>
      <AvailabilityForm
        token={token}
        initial={{ mode: member.availabilityMode, ...current }}
        groups={groups}
        months={months.map((m) => ({ key: m, label: monthLabel(m) }))}
      />
    </>
  );
}
