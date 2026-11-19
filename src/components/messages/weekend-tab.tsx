"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Pencil, Send, TriangleAlert, UserRoundPlus } from "lucide-react";

import { logMessageAction, saveMessageOrderAction } from "@/app/(app)/messages/actions";
import { WaText } from "@/components/messages/wa-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WeekendData } from "@/db/queries/messages";
import { addDays, shortDate } from "@/lib/dates/calendar";
import { whatsappLink } from "@/lib/messages/compose";

/**
 * This weekend (§12): the Friday–Sunday group message as one message per
 * location — each ready to copy or share to its own group, with "Edit before
 * copying" — then each pair with a button per partner for their reminder.
 */
export function WeekendTab({ data, canEdit }: { data: WeekendData; canEdit: boolean }) {
  const router = useRouter();
  const draft = data.months.filter((m) => m.status === "draft");

  const log = (body: string, kind: "weekend_group" | "pair_reminder", memberId: string | null = null) =>
    canEdit ? void logMessageAction({ kind, memberId, month: null, weekStart: data.friday, text: body, status: "sent" }).then(() => router.refresh()) : undefined;

  const move = async (index: number, delta: number) => {
    const order = data.locations.map((l) => l.id);
    const [item] = order.splice(index, 1);
    order.splice(index + delta, 0, item);
    const result = await saveMessageOrderAction(order).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save.");
    router.refresh();
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 content-start gap-4">
        <div className="rise flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight">Group messages</h2>
            <p className="text-[0.8125rem] text-muted-foreground">
              {shortDate(data.friday)} – {shortDate(data.sunday)} · one per location
              {data.lastSent ? ` · last sent ${data.lastSent.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Accra" })}` : ""}
            </p>
          </div>
          <nav aria-label="Weekend" className="flex items-center gap-1">
            <Button asChild variant="outline" size="icon" aria-label="Previous weekend">
              <Link href={`/messages?tab=weekend&friday=${addDays(data.friday, -7)}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <Button asChild variant="outline" size="icon" aria-label="Next weekend">
              <Link href={`/messages?tab=weekend&friday=${addDays(data.friday, 7)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </nav>
        </div>

        {draft.length > 0 ? (
          <p className="rise flex gap-2 rounded-xl border border-warning-border bg-warning px-3 py-2 text-[0.8125rem] text-warning-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            This weekend is in a month that&apos;s still a draft. Publish it first if the pairs are final.
          </p>
        ) : null}

        {data.messages.length === 0 ? (
          <p className="rise rounded-2xl bg-muted px-3.5 py-3 text-[0.8125rem] text-muted-foreground">
            No sessions are stored for this weekend. Generate its month in{" "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/schedule/${data.friday.slice(0, 7)}`}>
              Schedule
            </Link>{" "}
            first.
          </p>
        ) : (
          data.messages.map((m, i) => <GroupMessage key={m.locationId} name={m.name} text={m.text} delay={i * 60} onSent={(body) => log(body, "weekend_group")} />)
        )}

        {data.messages.length > 1 ? <CopyBoth text={data.text} onSent={(body) => log(body, "weekend_group")} /> : null}

        {data.locations.length > 1 && canEdit ? (
          <div className="rise grid gap-1.5 rounded-2xl border border-border bg-card p-4 shadow-card">
            <p className="text-[0.75rem] font-medium text-muted-foreground">Which comes first</p>
            <ol className="grid gap-1">
              {data.locations.map((l, i) => (
                <li key={l.id} className="flex items-center gap-2 text-[0.8125rem]">
                  <span className="tabular w-4 text-muted-foreground">{i + 1}.</span>
                  <span className="grow">{l.messageName}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${l.messageName} up`} disabled={i === 0} onClick={() => void move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${l.messageName} down`} disabled={i === data.locations.length - 1} onClick={() => void move(i, 1)}>
                    <ArrowDown />
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <section className="rise grid min-w-0 content-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5 [animation-delay:60ms]" aria-labelledby="pairs">
        <div>
          <h2 id="pairs" className="font-display text-base font-semibold tracking-tight">
            Pair by pair
          </h2>
          <p className="text-[0.8125rem] text-muted-foreground">A reminder for each partner, sent from your own WhatsApp.</p>
        </div>
        {data.pairs.length === 0 ? <p className="text-[0.8125rem] text-muted-foreground">Nobody is placed this weekend yet.</p> : null}
        <ul className="grid gap-2">
          {data.pairs.map((pair) => (
            <li key={pair.sessionId} className="rounded-xl border border-border bg-background/60 p-3">
              <p className="text-[0.8125rem] font-semibold">{pair.when}</p>
              <p className="text-[0.75rem] text-muted-foreground">
                {pair.location} · {pair.partners}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pair.recipients.map((r) =>
                  r.phone ? (
                    <Button
                      key={r.memberId}
                      size="sm"
                      variant={r.sent ? "ghost" : "outline"}
                      onClick={() => {
                        window.open(whatsappLink(r.text, r.phone), "_blank", "noopener");
                        log(r.text, "pair_reminder", r.memberId);
                      }}
                    >
                      {r.sent ? <Check /> : <Send />}
                      {r.sent ? `Sent to ${r.name.replace(/^(Bro|Sis) /, "")}` : `Send to ${r.name}`}
                    </Button>
                  ) : (
                    <Button key={r.memberId} asChild size="sm" variant="ghost">
                      <Link href={`/members?q=${encodeURIComponent(r.name.replace(/^(Bro|Sis) /, ""))}`}>
                        <UserRoundPlus />
                        Add number for {r.name}
                      </Link>
                    </Button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
        {data.pairs.some((p) => p.recipients.some((r) => !r.phone)) ? (
          <Badge variant="secondary" className="justify-self-start">
            {data.pairs.flatMap((p) => p.recipients).filter((r) => !r.phone).length} without a number
          </Badge>
        ) : null}
      </section>
    </div>
  );
}

/** One location's message: complete on its own, with its own Copy, Share and Edit. */
function GroupMessage({ name, text: initial, delay, onSent }: { name: string; text: string; delay: number; onSent: (text: string) => void }) {
  const [text, setText] = React.useState(initial);
  const [editing, setEditing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${name} message copied`, { description: "Paste it into that group." });
    window.setTimeout(() => setCopied(false), 1800);
    onSent(text);
  };

  return (
    <section className="rise grid min-w-0 content-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" style={{ animationDelay: `${delay}ms` }} aria-label={`Message for ${name}`}>
      <h3 className="font-display text-[0.9375rem] font-semibold tracking-tight">{name}</h3>
      {editing ? (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label={`Message for ${name}`}
          className="min-h-[22rem] w-full rounded-xl border border-input bg-background px-3.5 py-3 font-mono text-[0.8125rem] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
        />
      ) : (
        <WaText text={text} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void copy()} aria-label={`Copy the ${name} message`}>
          {copied ? <Check /> : <Copy />}
          Copy
        </Button>
        <Button
          variant="outline"
          aria-label={`Share the ${name} message to WhatsApp`}
          onClick={() => {
            window.open(whatsappLink(text), "_blank", "noopener");
            onSent(text);
          }}
        >
          <Send />
          Share to WhatsApp
        </Button>
        <Button variant="ghost" onClick={() => setEditing((e) => !e)} aria-pressed={editing}>
          <Pencil />
          {editing ? "Done editing" : "Edit before copying"}
        </Button>
        {editing && text !== initial ? (
          <Button variant="ghost" onClick={() => setText(initial)}>
            Undo edits
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** Both locations in one message, for a group that has everyone. */
function CopyBoth({ text, onSent }: { text: string; onSent: (text: string) => void }) {
  return (
    <div className="rise flex flex-wrap items-center gap-2 px-1 text-[0.8125rem] text-muted-foreground">
      <span>Need them together?</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          toast.success("Both copied as one message");
          onSent(text);
        }}
      >
        <Copy />
        Copy both as one
      </Button>
    </div>
  );
}

