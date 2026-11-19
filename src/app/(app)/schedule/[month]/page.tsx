import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarOff, ChevronLeft, ChevronRight, Info } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { AdoptMonth } from "@/components/schedule/adopt-month";
import { ScheduleBuilder, type BuilderSummary } from "@/components/schedule/schedule-builder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db/client";
import { getMonthView, listOpenRequests, listScheduleMonths } from "@/db/queries/schedule";
import { loadMonthInput } from "@/db/scheduler-input";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { isMonth, monthLabel, monthOf, shiftMonth, shortDate, todayInAccra } from "@/lib/dates/calendar";
import { describeIssues } from "@/lib/schedule/describe-issues";
import { buildGrids, monthCounts, monthSpecials } from "@/lib/schedule/month-view";
import { evaluate } from "@/lib/scheduler/evaluate";
import { monthShort } from "@/lib/scheduler/month";

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }): Promise<Metadata> {
  const { month } = await params;
  return { title: isMonth(month) ? `Schedule · ${monthLabel(month)}` : "Schedule" };
}

const STATUS = {
  none: { label: "Not built", variant: "secondary" },
  draft: { label: "Draft", variant: "warning" },
  published: { label: "Published", variant: "positive" },
  archived: { label: "Past month", variant: "secondary" },
  imported: { label: "Imported", variant: "outline" },
} as const;

const HARD = new Set(["same_day", "over_limit", "unavailable", "never_pair", "mixed_pair"]);

export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const user = await requireUser();
  const { month } = await params;
  if (!isMonth(month)) notFound();

  const [view, months, { input, settings }, requests] = await Promise.all([getMonthView(month), listScheduleMonths(), loadMonthInput(db(), month), listOpenRequests(month)]);
  const evaluation = evaluate(input);
  const grids = buildGrids(view.locations, view.sessions);
  const specials = monthSpecials(view.sessions);
  const counts = monthCounts(view.sessions);
  const current = monthOf(todayInAccra());

  const status = view.schedule ? view.schedule.status : "none";
  const past = status === "archived";
  const built = view.schedule !== null;
  const badge = view.schedule ? (view.schedule.imported && view.schedule.status === "archived" ? STATUS.imported : STATUS[view.schedule.status]) : STATUS.none;

  const names = new Map(input.members.map((m) => [m.id, m.name]));
  const locationName = new Map(view.locations.map((l) => [l.id, l.name]));
  const sessions = view.sessions.map((s) => ({ ...s, locationName: locationName.get(s.locationId) ?? "" }));
  const issues = describeIssues(evaluation.issues, names, new Map(sessions.map((s) => [s.key, s])), past);

  const loads = evaluation.loads
    .map((l) => ({ id: l.memberId, name: names.get(l.memberId) ?? "Someone", count: l.count, limit: l.limit }))
    .filter((l) => !past || l.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const counted = past ? loads : loads.filter((l) => l.limit > 0);
  const summary: BuilderSummary = {
    repeated: evaluation.repeats.repeated,
    pairs: evaluation.repeats.pairs,
    lastMonthLabel: evaluation.repeats.lastMonth ? monthShort(evaluation.repeats.lastMonth, month) : null,
    clashes: evaluation.issues.filter((i) => HARD.has(i.kind) && !(past && (i.kind === "over_limit" || i.kind === "unavailable"))).length,
    spreadMin: counted.length ? Math.min(...counted.map((l) => l.count)) : 0,
    spreadMax: counted.length ? Math.max(...counted.map((l) => l.count)) : 0,
    unused: past ? 0 : loads.filter((l) => l.count === 0).length,
    needed: evaluation.capacity.needed,
    available: evaluation.capacity.available,
    unfilled: evaluation.issues.filter((i) => i.kind === "unfilled").length,
  };

  const limits = settings.privilegeLimits;
  const rules = [
    settings.weekRule === "calendar_week" ? "Mon–Sun weeks" : "Nth-weekday weeks",
    settings.includeFifthWeek ? "5th week scheduled" : "No 5th week",
    "Bro + Bro, Sis + Sis, or a couple",
    settings.repeatWindowMonths === 0 ? "Repeats allowed" : `Avoid repeats for ${settings.repeatWindowMonths} ${settings.repeatWindowMonths === 1 ? "month" : "months"}`,
    `Limits ${limits.publisher} · ${limits.auxiliary_pioneer} · ${limits.regular_pioneer}`,
  ];

  const notices = (
    <>
      {specials.length > 0 ? (
        <div className="rise flex gap-3 rounded-2xl border border-warning-border bg-warning p-4 text-warning-foreground">
          <CalendarOff className="mt-0.5 size-4 shrink-0" />
          <ul className="grid gap-1.5 text-[0.8125rem]">
            {specials.map((s) => (
              <li key={s.name}>
                <span className="font-semibold">{s.name}</span> · {s.dates.map((d) => shortDate(d)).join(", ")}
                {s.note ? <span className="block opacity-85">{s.note}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.schedule?.imported && view.schedule.status === "archived" && month >= current && hasRole(user, "editor") ? <AdoptMonth month={month} monthName={monthLabel(month)} /> : null}
      {view.schedule?.imported ? (
        <p className="rise flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          {view.schedule.notes}. Shown as it was served; it counts as history for later months.
        </p>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {monthLabel(month)}
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </span>
        }
        description={
          <span className="tabular">
            {counts.sessions} sessions
            {built ? ` · ${counts.filled} filled` : ""}
            {counts.cancelled ? ` · ${counts.cancelled} off for special days` : ""}
            {counts.moved ? ` · ${counts.moved} at a different time` : ""}
          </span>
        }
        action={
          <nav aria-label="Month" className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}>
              <Link href={`/schedule/${shiftMonth(month, -1)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            {month !== current ? (
              <Button asChild variant="ghost">
                <Link href={`/schedule/${current}`}>This month</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="icon" aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}>
              <Link href={`/schedule/${shiftMonth(month, 1)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </nav>
        }
      />

      {months.length > 0 ? (
        <nav aria-label="Months with a schedule" className="rise -mt-2 mb-5 flex flex-wrap gap-1.5">
          {months.map((m) => (
            <Link
              key={m.month}
              href={`/schedule/${m.month}`}
              aria-current={m.month === month ? "page" : undefined}
              className="min-h-8 rounded-full border border-border bg-card px-3 py-1 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:border-inverted aria-[current=page]:bg-inverted aria-[current=page]:text-inverted-foreground pointer-coarse:min-h-11 pointer-coarse:py-2.5"
            >
              {monthLabel(m.month).replace(/ \d{4}$/, (y) => ` ’${y.slice(-2)}`)}
              {m.status === "draft" ? " · draft" : ""}
            </Link>
          ))}
        </nav>
      ) : null}

      <ScheduleBuilder
        month={month}
        monthName={monthLabel(month)}
        status={status}
        canEdit={hasRole(user, "editor")}
        built={built}
        grids={grids}
        sessions={sessions}
        badges={evaluation.badges}
        members={input.members.map((m) => ({ id: m.id, name: m.name, title: m.gender === "F" ? "Sis" : "Bro", active: m.active }))}
        summary={summary}
        issues={issues}
        loads={loads}
        rules={rules}
        lockedCount={view.sessions.filter((s) => s.locked).length}
        notices={notices}
        requests={requests}
      />
    </>
  );
}
