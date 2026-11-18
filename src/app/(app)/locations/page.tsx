import type { Metadata } from "next";
import { MapPin } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Locations & slots" };

export default function Page() {
  return (
    <>
      <PageHeader title="Locations & slots" description="Where and when witnessing happens, and the special days that change it." />
      <EmptyState
        icon={MapPin}
        title="No locations yet"
        hint="The seed in milestone 2 adds Police Station – Westlands and Haatso – near MTN office with their slots."
        className="rise bg-card"
      />
    </>
  );
}
