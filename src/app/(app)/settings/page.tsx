import type { Metadata } from "next";
import { Settings } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Week rule, limits, scoring and who has access." />
      <EmptyState
        icon={Settings}
        title="Settings are on their way"
        hint="The settings screen arrives with the features it controls, starting in milestone 3."
        className="rise bg-card"
      />
    </>
  );
}
