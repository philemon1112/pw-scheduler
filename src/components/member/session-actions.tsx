"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, LoaderCircle, X } from "lucide-react";

import { confirmAction, declineAction } from "@/app/m/[token]/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Confirm, or "I can't make it" with an optional reason — the member's two answers for a session. */
export function SessionActions({ token, assignmentId, confirmed, requested }: { token: string; assignmentId: string; confirmed: boolean; requested: boolean }) {
  const router = useRouter();
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState<"confirm" | "decline" | null>(null);

  if (requested) return <p className="text-[0.8125rem] text-warning-foreground">You said you can&apos;t make it. You&apos;ll hear back once someone takes your place.</p>;

  const confirm = async () => {
    setPending("confirm");
    const result = await confirmAction(token, assignmentId).catch(() => null);
    setPending(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through. Try again.");
    toast.success("Thank you — confirmed");
    router.refresh();
  };

  const decline = async () => {
    setPending("decline");
    const result = await declineAction(token, assignmentId, reason).catch(() => null);
    setPending(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through. Try again.");
    toast.success("Thanks for letting us know");
    setDeclining(false);
    router.refresh();
  };

  if (declining) {
    return (
      <div className="grid gap-2">
        <Label htmlFor={`reason-${assignmentId}`}>Reason (optional)</Label>
        <textarea
          id={`reason-${assignmentId}`}
          value={reason}
          maxLength={300}
          onChange={(event) => setReason(event.target.value)}
          className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-[0.9375rem] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          placeholder="Travelling, unwell…"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void decline()} disabled={pending !== null}>
            {pending === "decline" ? <LoaderCircle className="animate-spin" /> : null}
            Send
          </Button>
          <Button variant="ghost" onClick={() => setDeclining(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {confirmed ? (
        <span className="inline-flex min-h-9 items-center gap-1.5 text-[0.875rem] font-medium text-accent-foreground">
          <Check className="size-4" />
          You&apos;ve confirmed
        </span>
      ) : (
        <Button size="sm" onClick={() => void confirm()} disabled={pending !== null}>
          {pending === "confirm" ? <LoaderCircle className="animate-spin" /> : <Check />}
          I&apos;ll be there
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setDeclining(true)} disabled={pending !== null}>
        <X />
        I can&apos;t make it
      </Button>
    </div>
  );
}
