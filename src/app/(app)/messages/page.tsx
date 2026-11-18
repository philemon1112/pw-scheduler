import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Messages" };

export default function Page() {
  return (
    <>
      <PageHeader title="Messages" description="The Thursday group message, monthly previews and pair reminders." />
      <EmptyState
        icon={MessageCircle}
        title="No messages yet"
        hint="Messages arrive in milestone 6, built from the published schedule."
        className="rise bg-card"
      />
    </>
  );
}
