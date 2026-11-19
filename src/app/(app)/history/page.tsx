import type { Metadata } from "next";

import { HistoryView } from "@/components/history/history-view";
import { PageHeader } from "@/components/page-header";
import { getHistory } from "@/db/queries/history";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  const user = await requireUser();
  const { sessions, people, months } = await getHistory();
  return (
    <>
      <PageHeader title="History" description="Who has served with whom, and when. Imported and published months count." />
      <HistoryView sessions={sessions} people={people} months={months} canImport={hasRole(user, "editor")} />
    </>
  );
}
