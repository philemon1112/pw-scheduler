"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Copy, Link2, LoaderCircle, MessageSquareWarning, Send, SkipForward, UserRoundPlus } from "lucide-react";

import { logMessageAction, makeMissingLinksAction } from "@/app/(app)/messages/actions";
import { WaText } from "@/components/messages/wa-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MonthlyData, PreviewRow } from "@/db/queries/messages";
import { monthLabel, shiftMonth } from "@/lib/dates/calendar";
import { whatsappLink } from "@/lib/messages/compose";
import { cn } from "@/lib/utils";

const STATUS: Record<PreviewRow["status"], { label: string; variant: "secondary" | "positive" | "warning" }> = {
  not_sent: { label: "Not sent", variant: "secondary" },
  sent: { label: "Sent", variant: "positive" },
  change_requested: { label: "Change requested", variant: "warning" },
};

/**
 * Monthly previews (§12): one message per person, before the month. Open
 * WhatsApp to their number, mark it sent, and "Next person" moves on to the
 * next one not sent — so the whole list goes out in a few minutes.
 */
export function MonthlyTab({ data, canEdit }: { data: MonthlyData; canEdit: boolean }) {
  const router = useRouter();
  const firstUnsent = data.rows.find((r) => r.status === "not_sent")?.memberId ?? data.rows[0]?.memberId ?? null;
  const [selected, setSelected] = React.useState<string | null>(firstUnsent);
  const [busy, setBusy] = React.useState(false);
  const current = data.rows.find((r) => r.memberId === selected) ?? null;
  const sent = data.rows.filter((r) => r.status === "sent").length;
  const withoutLink = data.rows.filter((r) => !r.hasLink);

  const mark = async (row: PreviewRow, status: "sent" | "change_requested") => {
    if (!canEdit) return;
    const result = await logMessageAction({ kind: "monthly_preview", memberId: row.memberId, month: data.month, weekStart: null, text: row.text, status }).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save.");
    router.refresh();
  };

  const nextAfter = (id: string) => {
    const start = data.rows.findIndex((r) => r.memberId === id);
    for (let k = 1; k <= data.rows.length; k += 1) {
      const row = data.rows[(start + k) % data.rows.length];
      if (row.status === "not_sent" && row.memberId !== id) return row.memberId;
    }
    return null;
  };

  const sendAndNext = (row: PreviewRow) => {
    if (row.phone) window.open(whatsappLink(row.text, row.phone), "_blank", "noopener");
    void mark(row, "sent");
    const next = nextAfter(row.memberId);
    if (next) setSelected(next);
    else toast.success("That's everyone");
  };

  // On a phone the message opens under the person; keep them in view as "next" moves on.
  React.useEffect(() => {
    if (!selected || !window.matchMedia("(max-width: 1023px)").matches) return;
    document.getElementById(`row-${selected}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [selected]);

  const panelFor = (row: PreviewRow, where: "side" | "inline") => (
    <section
      className={cn("grid content-start gap-3", where === "side" ? "rise rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5 lg:sticky lg:top-4" : "rounded-xl bg-background/70 p-2.5")}
      aria-label={`Message for ${row.name}`}
    >
      {where === "side" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-base font-semibold tracking-tight">{row.name}</h2>
          <Badge variant={STATUS[row.status].variant}>{STATUS[row.status].label}</Badge>
        </div>
      ) : null}
      <WaText text={row.text} />
      <div className="flex flex-wrap gap-2">
        {row.phone ? (
          <Button onClick={() => sendAndNext(row)}>
            <Send />
            Open WhatsApp · next person
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={`/members?q=${encodeURIComponent(row.name.replace(/^(Bro|Sis) /, ""))}`}>
              <UserRoundPlus />
              Add number
            </Link>
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(row.text);
            toast.success("Message copied");
          }}
        >
          <Copy />
          Copy
        </Button>
        {canEdit ? (
          <>
            <Button variant="ghost" onClick={() => void mark(row, "change_requested")}>
              <MessageSquareWarning />
              Change requested
            </Button>
            {row.status !== "sent" ? (
              <Button variant="ghost" onClick={() => void mark(row, "sent")}>
                <Check />
                Mark sent
              </Button>
            ) : null}
          </>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            const next = nextAfter(row.memberId);
            if (next) setSelected(next);
            else toast("Nobody else is waiting");
          }}
        >
          <SkipForward />
          Skip
        </Button>
      </div>
    </section>
  );

  const makeLinks = async () => {
    setBusy(true);
    const result = await makeMissingLinksAction(withoutLink.map((r) => r.memberId)).catch(() => null);
    setBusy(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    toast.success(`${result.made} ${result.made === 1 ? "link" : "links"} made`);
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rise flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Month" className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" aria-label="Previous month">
            <Link href={`/messages?tab=monthly&month=${shiftMonth(data.month, -1)}`}>
              <ChevronLeft />
            </Link>
          </Button>
          <span className="min-w-36 text-center font-display text-base font-semibold">{monthLabel(data.month)}</span>
          <Button asChild variant="outline" size="icon" aria-label="Next month">
            <Link href={`/messages?tab=monthly&month=${shiftMonth(data.month, 1)}`}>
              <ChevronRight />
            </Link>
          </Button>
        </nav>
        {data.rows.length > 0 ? (
          <p className="tabular text-[0.8125rem] text-muted-foreground">
            {sent} of {data.rows.length} sent
          </p>
        ) : null}
      </div>

      {data.status === null ? (
        <p className="rise rounded-2xl border border-dashed border-border bg-card/60 p-4 text-[0.8125rem] text-muted-foreground">
          {monthLabel(data.month)} hasn&apos;t been generated.{" "}
          <Link href={`/schedule/${data.month}`} className="font-medium text-primary underline-offset-4 hover:underline">
            Build it in Schedule
          </Link>
          .
        </p>
      ) : null}

      {withoutLink.length > 0 && canEdit ? (
        <div className="rise flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning-border bg-warning px-4 py-3 text-[0.8125rem] text-warning-foreground">
          <span>
            {withoutLink.length} {withoutLink.length === 1 ? "person has" : "people have"} no private link yet, so &ldquo;Add to your calendar&rdquo; would be empty.
          </span>
          <Button size="sm" variant="outline" onClick={() => void makeLinks()} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Link2 />}
            Make their links
          </Button>
        </div>
      ) : null}

      {data.rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <ul className="rise grid content-start gap-1 rounded-2xl border border-border bg-card p-2 shadow-card" aria-label="People booked this month">
            {data.rows.map((row) => (
              <li key={row.memberId} id={`row-${row.memberId}`} className="scroll-mt-4">
                <button
                  type="button"
                  onClick={() => setSelected(row.memberId)}
                  aria-current={selected === row.memberId}
                  className={cn(
                    "row-hover flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    selected === row.memberId && "bg-accent/60"
                  )}
                >
                  <span className="min-w-0 grow">
                    <span className="block truncate text-[0.875rem] font-medium">{row.name}</span>
                    <span className="block text-[0.75rem] text-muted-foreground">
                      {row.sessions} {row.sessions === 1 ? "session" : "sessions"}
                      {row.phoneLabel ? ` · ${row.phoneLabel}` : " · no number"}
                    </span>
                  </span>
                  <Badge variant={STATUS[row.status].variant} size="sm">
                    {row.status === "sent" ? <Check /> : null}
                    {STATUS[row.status].label}
                  </Badge>
                </button>
                {selected === row.memberId ? <div className="mt-1 lg:hidden">{panelFor(row, "inline")}</div> : null}
              </li>
            ))}
          </ul>

          {current ? <div className="hidden lg:block">{panelFor(current, "side")}</div> : null}
        </div>
      ) : data.status !== null ? (
        <p className="rise text-[0.8125rem] text-muted-foreground">Nobody is placed in {monthLabel(data.month)} yet.</p>
      ) : null}
    </div>
  );
}
