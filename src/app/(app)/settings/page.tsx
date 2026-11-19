import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { SettingsView, type WeekRuleExample } from "@/components/settings/settings-view";
import { listLocations } from "@/db/queries/locations";
import { getSettings } from "@/db/queries/settings";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { monthLabel, monthOf, todayInAccra, WEEKDAY_NAMES, WEEKDAYS, type Weekday } from "@/lib/dates/calendar";
import { calendarWeeks, nthWeekday, weekCount, weekRangeLabel } from "@/lib/dates/weeks";
import { PRIVILEGE_LABELS, PRIVILEGES } from "@/lib/members/limits";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [settings, places] = await Promise.all([getSettings(), listLocations()]);
  const month = monthOf(todayInAccra());

  // The weekdays that actually have slots, for the n-th weekday example.
  const used = new Set<Weekday>(places.flatMap((p) => p.slots.filter((s) => s.active).map((s) => s.weekday)));
  const days = (used.size > 0 ? WEEKDAYS.filter((d) => used.has(d)) : (["TUE", "SAT", "SUN"] as Weekday[])).slice(0, 4);
  const firstWeek = calendarWeeks(month)[0];
  const nth = days
    .map((d) => nthWeekday(month, 1, d))
    .filter((d): d is string => d !== null)
    .map((iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }));

  const examples: WeekRuleExample[] = [
    {
      rule: "calendar_week",
      title: "Monday to Sunday",
      explain: "Week 1 is the first Mon–Sun week whose Friday is in the month. Days outside the month are skipped.",
      example: firstWeek ? `Week 1 · ${weekRangeLabel(month, firstWeek)}` : "—",
      weeks: weekCount(month, "calendar_week"),
    },
    {
      rule: "nth_weekday",
      title: "Nth weekday",
      explain: `Week 1 is the first of each weekday: the first ${days.map((d) => WEEKDAY_NAMES[d]).join(", the first ")}.`,
      example: `Week 1 · ${nth.join(", ")}`,
      weeks: weekCount(month, "nth_weekday"),
    },
  ];

  return (
    <>
      <PageHeader title="Settings" description="How months are split into weeks, how pairs are chosen, and the congregation's name." />
      <SettingsView
        initial={{
          congregationName: settings.congregationName,
          weekRule: settings.weekRule,
          includeFifthWeek: settings.includeFifthWeek,
          repeatWindowMonths: settings.repeatWindowMonths,
        }}
        examples={examples}
        monthName={monthLabel(month)}
        limits={PRIVILEGES.map((p) => ({ label: PRIVILEGE_LABELS[p], value: settings.privilegeLimits[p] }))}
        canEdit={hasRole(user, "owner")}
      />
    </>
  );
}
