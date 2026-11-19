import type { Metadata } from "next";

import { ImportWizard } from "@/components/history/import-wizard";
import { PageHeader } from "@/components/page-header";
import { requirePageRole } from "@/lib/auth/session";
import { monthOf, todayInAccra } from "@/lib/dates/calendar";

export const metadata: Metadata = { title: "Import a schedule" };

export default async function ImportPage() {
  await requirePageRole("editor", "/history");
  return (
    <>
      <PageHeader title="Import a schedule" description="Bring in a month from Excel or Word. It counts as pair history, and a month that isn't over can then be used in the app." />
      <ImportWizard defaultMonth={monthOf(todayInAccra())} />
    </>
  );
}
