import type { Metadata } from "next";

import { MembersView } from "@/components/members/members-view";
import { listLocations } from "@/db/queries/locations";
import { listMembers } from "@/db/queries/members";
import { getSettings } from "@/db/queries/settings";
import { monthOf, todayInAccra } from "@/lib/dates/calendar";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const { q } = await searchParams;
  const month = monthOf(todayInAccra());
  const [people, places, settings] = await Promise.all([listMembers(month), listLocations(), getSettings()]);

  return (
    <MembersView
      members={people}
      locations={places.map((place) => ({
        id: place.id,
        key: place.key,
        name: place.name,
        slots: place.slots.filter((slot) => slot.active).map((slot) => ({ id: slot.id, weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime })),
      }))}
      limits={settings.privilegeLimits}
      month={month}
      canEdit={hasRole(user, "editor")}
      isOwner={hasRole(user, "owner")}
      initialQuery={typeof q === "string" ? q.slice(0, 80) : ""}
    />
  );
}
