import type { Metadata } from "next";
import { History } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "History" };

export default function Page() {
  return (
    <>
      <PageHeader title="History" description="Who has served with whom, and when." />
      <EmptyState
        icon={History}
        title="No history yet"
        hint="Pair history arrives in milestone 8, built from imported and published months."
        className="rise bg-card"
      />
    </>
  );
}
