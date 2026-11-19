import type { Metadata } from "next";

import Link from "next/link";
import { ChevronRight, FileJson, FileSpreadsheet, History, KeyRound, Users } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { WeightsCard } from "@/components/settings/weights-card";
import { DEFAULT_WEIGHTS, weightsFrom } from "@/lib/scheduler/problem";
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
      <div className="mt-4 grid grid-cols-1 gap-4">
        {hasRole(user, "owner") ? <WeightsCard weights={weightsFrom(settings.scoringWeights)} defaults={DEFAULT_WEIGHTS} custom={settings.scoringWeights !== null} /> : null}
        <nav aria-label="More settings" className="rise grid gap-1 rounded-2xl border border-border bg-card p-2 shadow-card">
          {[
            ...(hasRole(user, "owner")
              ? [
                  { href: "/settings/users", icon: Users, title: "Users and invites", hint: "Who can open the app" },
                  { href: "/settings/activity", icon: History, title: "Activity", hint: "Publishing, swaps, imports and edits" },
                ]
              : []),
            { href: "/settings/account", icon: KeyRound, title: "Your account", hint: "Change your password" },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="row-hover flex min-h-14 items-center gap-3 rounded-xl px-3 py-2">
              <item.icon className="size-4 text-primary" />
              <span className="grow">
                <span className="block text-[0.9375rem] font-medium">{item.title}</span>
                <span className="block text-[0.8125rem] text-muted-foreground">{item.hint}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          {hasRole(user, "owner") ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-3 pt-3 pb-1">
              <span className="grow text-[0.8125rem] text-muted-foreground">Export everything</span>
              <a href="/settings/export/json" download className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[0.8125rem] font-medium pointer-coarse:min-h-11">
                <FileJson className="size-4" />
                JSON
              </a>
              <a href="/settings/export/xlsx" download className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[0.8125rem] font-medium pointer-coarse:min-h-11">
                <FileSpreadsheet className="size-4" />
                .xlsx
              </a>
            </div>
          ) : null}
        </nav>
      </div>
    </>
  );
}
