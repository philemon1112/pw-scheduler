import type { Metadata } from "next";

import { getSettings } from "@/db/queries/settings";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Public member pages: no app shell, no navigation to anything else — just their own things. */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings();
  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16">
      <p className="mb-5 text-[0.75rem] font-medium tracking-wide text-muted-foreground uppercase">{settings.congregationName} · Public witnessing</p>
      {children}
    </div>
  );
}
