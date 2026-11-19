import type { Metadata } from "next";

import { ImportWizard } from "@/components/history/import-wizard";
import { PageHeader } from "@/components/page-header";
import { requirePageRole } from "@/lib/auth/session";
import { monthOf, shiftMonth, todayInAccra } from "@/lib/dates/calendar";

export const metadata: Metadata = { title: "Import an old sheet" };

export default async function ImportPage() {
  await requirePageRole("editor", "/history");
  return (
    <>
      <PageHeader title="Import an old sheet" description="Bring in a month from a spreadsheet. It's kept as it was served and counts as pair history." />
      <ImportWizard defaultMonth={shiftMonth(monthOf(todayInAccra()), -1)} />
    </>
  );
}
