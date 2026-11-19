import type { Metadata } from "next";
import Link from "next/link";

import { MonthlyTab } from "@/components/messages/monthly-tab";
import { WeekendTab } from "@/components/messages/weekend-tab";
import { WordingTab } from "@/components/messages/wording-tab";
import { PageHeader } from "@/components/page-header";
import { getMonthlyData, getTemplates, getWeekendData } from "@/db/queries/messages";
import { listScheduleMonths } from "@/db/queries/schedule";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { isMonth, monthLabel, monthOf, todayInAccra, weekdayOf } from "@/lib/dates/calendar";
import { weekendFriday } from "@/lib/messages/compose";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Messages" };

const TABS = [
  { key: "weekend", label: "This weekend" },
  { key: "monthly", label: "Monthly previews" },
  { key: "wording", label: "Wording" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ tab?: string; friday?: string; month?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "weekend";
  const canEdit = hasRole(user, "editor");
  const today = todayInAccra();

  let body: React.ReactNode;
  if (tab === "weekend") {
    const friday = params.friday && /^\d{4}-\d{2}-\d{2}$/.test(params.friday) && weekdayOf(params.friday) === "FRI" ? params.friday : weekendFriday(today);
    body = <WeekendTab key={friday} data={await getWeekendData(friday)} canEdit={canEdit} />;
  } else if (tab === "monthly") {
    // Previews go out before a month: default to the first month from now that is built and not past.
    let month = params.month && isMonth(params.month) ? params.month : null;
    if (!month) {
      const current = monthOf(today);
      month = (await listScheduleMonths()).find((m) => m.month >= current && m.status !== "archived")?.month ?? current;
    }
    body = <MonthlyTab key={month} data={await getMonthlyData(month, monthLabel(month))} canEdit={canEdit} />;
  } else {
    body = <WordingTab templates={await getTemplates()} canEdit={canEdit} />;
  }

  return (
    <>
      <PageHeader title="Messages" description="Ready to send from your own WhatsApp. Nothing is sent automatically." />
      <nav aria-label="Messages" className="rise mb-5 flex w-full max-w-md gap-1 rounded-xl bg-muted p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/messages?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "flex min-h-9 grow items-center justify-center rounded-lg px-2 text-[0.8125rem] font-medium transition-[background-color,box-shadow] duration-150 pointer-coarse:min-h-11",
              "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
              tab === t.key ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {body}
    </>
  );
}
