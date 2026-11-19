"use client";

import * as React from "react";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";

import { changePasswordAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm() {
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    const result = await changePasswordAction(current, next).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    toast.success("Password changed");
    setCurrent("");
    setNext("");
  };
  return (
    <form onSubmit={save} className="rise grid max-w-md gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-next">New password</Label>
        <Input id="pw-next" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
        <p className="text-[0.75rem] text-muted-foreground">At least 10 characters. A few words together is easier to remember than symbols.</p>
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Change password
      </Button>
    </form>
  );
}
