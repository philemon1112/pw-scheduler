import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/(auth)/login/login-form";
import { currentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Invite-only: there is no sign-up link, and saying so is kinder than a
 * form that can't succeed.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  if (await currentUser()) redirect("/schedule");
  const { callbackUrl } = await searchParams;
  let next = "/schedule";
  try {
    // Auth.js passes the page someone was sent away from as a full URL.
    if (callbackUrl) {
      const url = new URL(callbackUrl, "http://local");
      next = url.pathname + url.search;
    }
  } catch {}

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="rise w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-inverted font-display text-lg font-bold text-inverted-foreground">
            PW
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight">PW Scheduler</h1>
          <p className="mt-1 text-[0.875rem] text-muted-foreground">Westlands English Congregation</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <LoginForm next={next} />
        </div>
        <p className="mt-4 text-center text-[0.75rem] text-muted-foreground">Accounts are by invitation from the owner.</p>
      </div>
    </main>
  );
}
