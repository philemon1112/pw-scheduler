import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, FileSpreadsheet } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SheetEditor } from "@/components/print/sheet-editor";
import { Button } from "@/components/ui/button";
import { getPrintData } from "@/db/queries/print";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { isMonth, monthLabel, shiftMonth } from "@/lib/dates/calendar";

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }): Promise<Metadata> {
  const { month } = await params;
  return { title: isMonth(month) ? `Sheet · ${monthLabel(month)}` : "Sheet & print" };
}

export default async function SheetMonthPage({ params }: { params: Promise<{ month: string }> }) {
  const user = await requireUser();
  const { month } = await params;
  if (!isMonth(month)) notFound();
  const data = await getPrintData(month);

  return (
    <>
      <PageHeader
        title={`Sheet · ${monthLabel(month)}`}
        description="The printed schedule. Edits here change the printout only, never the pairs."
        action={
          <>
            <nav aria-label="Month" className="flex items-center gap-1">
              <Button asChild variant="outline" size="icon" aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}>
                <Link href={`/sheet/${shiftMonth(month, -1)}`}>
                  <ChevronLeft />
                </Link>
              </Button>
              <Button asChild variant="outline" size="icon" aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}>
                <Link href={`/sheet/${shiftMonth(month, 1)}`}>
                  <ChevronRight />
                </Link>
              </Button>
            </nav>
            <Button asChild variant="ghost">
              <Link href={`/schedule/${month}`}>
                <CalendarDays />
                Schedule
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={`/sheet/${month}/export`} download>
                <FileSpreadsheet />
                Export .xlsx
              </a>
            </Button>
            <Button asChild>
              <a href={`/print/${month}?print=1`} target="_blank" rel="noopener">
                <FileDown />
                Download PDF
              </a>
            </Button>
          </>
        }
      />
      <SheetEditor
        key={month}
        month={month}
        sheet={data.sheet}
        initialLayout={data.layout}
        initialSettings={data.settings}
        editable={data.hasSchedule && hasRole(user, "editor")}
      />
    </>
  );
}
