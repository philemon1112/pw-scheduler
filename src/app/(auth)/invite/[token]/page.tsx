import type { Metadata } from "next";

import { db } from "@/db/client";
import { inviteFor } from "@/db/mutations/users";
import { looksLikeToken } from "@/lib/tokens";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Accept invite", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = looksLikeToken(token) ? await inviteFor(db(), token) : null;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="rise w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-inverted font-display text-lg font-bold text-inverted-foreground">PW</span>
          <h1 className="font-display text-2xl font-bold tracking-tight">{invite ? `Welcome, ${invite.name}` : "This invite doesn't work"}</h1>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">{invite ? "Choose a password to finish setting up your account." : "It may have expired or already been used. Ask for a new one."}</p>
        </div>
        {invite ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <InviteForm token={token} email={invite.email} />
          </div>
        ) : null}
      </div>
    </main>
  );
}
