import type { Metadata } from "next";
import { Printer } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Sheet & print" };

export default function Page() {
  return (
    <>
      <PageHeader title="Sheet & print" description="Edit the printed sheet and download the PDF." />
      <EmptyState
        icon={Printer}
        title="Nothing to print yet"
        hint="The print layout and sheet editor arrive in milestone 5, once a month has a schedule."
        className="rise bg-card"
      />
    </>
  );
}
