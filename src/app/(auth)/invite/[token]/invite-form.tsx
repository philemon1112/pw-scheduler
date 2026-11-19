"use client";

import * as React from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { acceptInviteAction } from "./actions";

export function InviteForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  if (done) {
    return (
      <div className="grid gap-3 text-center">
        <p className="text-[0.9375rem] font-medium">You&apos;re all set.</p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const result = await acceptInviteAction(token, password).catch(() => null);
        setPending(false);
        if (!result?.ok) return setError(result?.error ?? "That didn't go through.");
        setDone(true);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" value={email} readOnly autoComplete="username" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="invite-password">Choose a password</Label>
        <Input id="invite-password" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
        <p className="text-[0.75rem] text-muted-foreground">At least 10 characters.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-danger-border bg-danger px-3 py-2 text-[0.8125rem] text-danger-foreground">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Set password
      </Button>
    </form>
  );
}
