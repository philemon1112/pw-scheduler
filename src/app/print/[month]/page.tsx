import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AutoPrint, PrintButton } from "@/components/print/print-controls";
import { PrintSheet } from "@/components/print/print-sheet";
import { getPrintData } from "@/db/queries/print";
import { requireUser } from "@/lib/auth/session";
import { isMonth, monthLabel } from "@/lib/dates/calendar";
import { applyLayout } from "@/lib/print/sheet";

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }): Promise<Metadata> {
  const { month } = await params;
  // The browser names the saved PDF after the page title.
  return { title: { absolute: isMonth(month) ? `Public Witnessing Schedule - ${monthLabel(month)}` : "Public Witnessing Schedule" } };
}

/**
 * The PDF (§11): the sheet alone, sized for A4 by `@page`, with the colours
 * forced to print. "Download PDF" opens this with `?print=1`, which opens
 * the print dialog by itself; the browser's "Save as PDF" does the rest.
 */
export default async function PrintPage({ params, searchParams }: { params: Promise<{ month: string }>; searchParams: Promise<{ print?: string }> }) {
  await requireUser();
  const { month } = await params;
  if (!isMonth(month)) notFound();
  const { print } = await searchParams;

  const data = await getPrintData(month);
  const sheet = applyLayout(data.sheet, data.layout);
  const { orientation, margins, fitToWidth, fontSize } = data.settings;
  const margin = margins === "narrow" ? "6.35mm" : "12.7mm";
  const pageWidth = orientation === "landscape" ? "297mm" : "210mm";

  return (
    <>
      <style>{`
        @page { size: A4 ${orientation}; margin: ${margin}; }
        body { background: #e9ebe8; }
        .print-page { width: ${pageWidth}; min-height: ${orientation === "landscape" ? "210mm" : "297mm"}; padding: ${margin}; margin: 0 auto 2rem; background: #fff; box-shadow: 0 2px 18px rgb(0 0 0 / 0.12); box-sizing: border-box; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-page { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
        }
      `}</style>
      <div className="no-print mx-auto flex max-w-[297mm] flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href={`/sheet/${month}`} className="inline-flex min-h-11 items-center gap-2 text-[0.875rem] font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Back to the sheet
        </Link>
        <div className="flex items-center gap-3">
          <p className="hidden text-[0.8125rem] text-muted-foreground sm:block">In the print dialog, choose &ldquo;Save as PDF&rdquo;.</p>
          <PrintButton />
        </div>
      </div>
      <main className="print-page">
        <PrintSheet sheet={sheet} fitToWidth={fitToWidth} fontSize={fontSize} />
      </main>
      {print === "1" ? <AutoPrint /> : null}
    </>
  );
}
