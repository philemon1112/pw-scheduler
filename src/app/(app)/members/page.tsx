import type { Metadata } from "next";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Members" };

export default function Page() {
  return (
    <>
      <PageHeader title="Members" description="Everyone on the rota, their privilege, availability and partners." />
      <EmptyState
        icon={Users}
        title="No members yet"
        hint="Running the seed in milestone 2 brings in the 41 people from your schedules."
        className="rise bg-card"
      />
    </>
  );
}
