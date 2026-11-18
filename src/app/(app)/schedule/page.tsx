import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Schedule" };

export default function Page() {
  return (
    <>
      <PageHeader title="Schedule" description="Build a month, lock the pairs you want to keep, and publish." />
      <EmptyState
        icon={CalendarDays}
        title="No schedule yet"
        hint="The builder arrives in milestone 4. Locations, members and your July, September and November history come first (milestone 2)."
        className="rise bg-card"
      />
    </>
  );
}
