"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Info, LoaderCircle, MessageCircle, Printer, Repeat2, Send, Sparkles, TriangleAlert, Undo2, Users } from "lucide-react";

import { generateAction, setStatusAction, swapCellsAction } from "@/app/(app)/schedule/actions";
import { CellPanel, type PanelMember, type PanelSession } from "@/components/schedule/cell-panel";
import { MonthGrid } from "@/components/schedule/month-grid";
import { RequestsCard } from "@/components/schedule/requests-card";
import type { OpenRequest } from "@/db/queries/schedule";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { IssueLine } from "@/lib/schedule/describe-issues";
import type { LocationGrid } from "@/lib/schedule/month-view";
import type { Badge as CellBadge } from "@/lib/scheduler/types";
import { cn } from "@/lib/utils";

export interface BuilderSummary {
  repeated: number;
  pairs: number;
  lastMonthLabel: string | null;
  clashes: number;
  spreadMin: number;
  spreadMax: number;
  unused: number;
  needed: number;
  available: number;
  unfilled: number;
}

export interface LoadRow {
  id: string;
  name: string;
  count: number;
  limit: number;
}

/**
 * The schedule builder (§10.1). The server works out the month, the
 * evaluation and the sentences; this component handles what the person does
 * — generate, publish, open a cell, drag one cell onto another — and refreshes
 * from the server after each change, so the warnings are always the
 * engine's, never a guess made in the browser.
 */
export function ScheduleBuilder({
  month,
  monthName,
  status,
  canEdit,
  built,
  grids,
  sessions,
  badges,
  members,
  summary,
  issues,
  loads,
  rules,
  lockedCount,
  notices,
  requests,
}: {
  month: string;
  monthName: string;
  status: "none" | "draft" | "published" | "archived";
  canEdit: boolean;
  built: boolean;
  grids: LocationGrid[];
  sessions: PanelSession[];
  badges: Record<string, CellBadge[]>;
  members: PanelMember[];
  summary: BuilderSummary;
  issues: IssueLine[];
  loads: LoadRow[];
  rules: string[];
  lockedCount: number;
  notices: React.ReactNode;
  requests: OpenRequest[];
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = React.useState<"generate" | "status" | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const [, startTransition] = React.useTransition();

  const past = status === "archived";
  const editable = canEdit && built && !past;
  const byKey = React.useMemo(() => new Map(sessions.map((s) => [s.key, s])), [sessions]);
  const selectedSession = selected ? (byKey.get(selected) ?? null) : null;

  const refresh = (keys: string[] = []) => {
    startTransition(() => router.refresh());
    if (keys.length > 0) {
      setFlash(new Set(keys));
      window.setTimeout(() => setFlash(new Set()), 1000);
    }
  };

  const generate = async () => {
    setConfirming(false);
    setBusy("generate");
    const result = await generateAction(month).catch(() => null);
    setBusy(null);
    if (!result) return void toast.error("That didn't go through. Check your connection and try again.");
    if (!result.ok) return void toast.error(result.error);
    toast.success(`${monthName} built in ${result.ms} ms`, {
      description: `${result.placed} sessions filled${result.unfilled ? `, ${result.unfilled} left empty — the limits don't stretch that far` : ""}.`,
    });
    setRound((r) => r + 1);
    setSelected(null);
    refresh();
  };

  const setStatus = async (next: "draft" | "published") => {
    setBusy("status");
    const result = await setStatusAction(month, next).catch(() => null);
    setBusy(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    toast.success(next === "published" ? `${monthName} published` : `${monthName} is a draft again`, {
      description: next === "published" ? "Its pairs now count as history for the months after it." : "You can rebuild it now.",
    });
    refresh();
  };

  const swap = async (from: string, to: string) => {
    const result = await swapCellsAction(from, to).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? "That swap didn't go through.");
    toast.success("Swapped");
    refresh([from, to]);
  };

  const canGenerate = canEdit && !past && status !== "published";

  return (
    <div className="grid grid-cols-1 gap-4">
      {/* Actions */}
      <div className="rise flex flex-wrap items-center gap-2">
        {canGenerate ? (
          <Button onClick={() => (built && summary.needed > 0 ? setConfirming(true) : void generate())} disabled={busy !== null}>
            {busy === "generate" ? <LoaderCircle className="animate-spin" /> : built ? <Repeat2 /> : <Sparkles />}
            {busy === "generate" ? "Building…" : built ? "Regenerate unlocked" : "Generate"}
          </Button>
        ) : null}
        {canEdit && built && !past ? (
          status === "published" ? (
            <Button variant="outline" onClick={() => void setStatus("draft")} disabled={busy !== null}>
              {busy === "status" ? <LoaderCircle className="animate-spin" /> : <Undo2 />}
              Back to draft
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void setStatus("published")} disabled={busy !== null}>
              {busy === "status" ? <LoaderCircle className="animate-spin" /> : <Send />}
              Publish
            </Button>
          )
        ) : null}
        <Button asChild variant="ghost">
          <Link href={`/sheet/${month}`}>
            <Printer />
            Sheet & print
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/messages?month=${month}`}>
            <MessageCircle />
            Messages
          </Link>
        </Button>
      </div>

      {rules.length > 0 ? (
        <ul className="rise -mt-1 flex flex-wrap gap-1.5 [animation-delay:40ms]" aria-label="Rules in use">
          {rules.map((rule) => (
            <li key={rule} className="rounded-full border border-border bg-card px-3 py-1 text-[0.75rem] text-muted-foreground">
              {rule}
            </li>
          ))}
        </ul>
      ) : null}

      <RequestsCard requests={requests} canEdit={canEdit} onOpen={setSelected} />

      {notices}

      {!past && summary.available < summary.needed ? (
        <div className="rise flex gap-3 rounded-2xl border border-warning-border bg-warning p-4 text-warning-foreground">
          <Users className="mt-0.5 size-4 shrink-0" />
          <p className="text-[0.8125rem]">
            <span className="font-semibold">
              The limits allow {summary.available} of the {summary.needed} places this month needs.
            </span>{" "}
            About {Math.ceil((summary.needed - summary.available) / 2)} sessions will stay empty. Raise the limits or set people&apos;s privileges in{" "}
            <Link href="/members" className="font-medium underline underline-offset-4">
              Members
            </Link>
            .
          </p>
        </div>
      ) : null}

      {built ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            delay={60}
            tone={summary.repeated === 0 ? "good" : "warn"}
            icon={Repeat2}
            label="Repeated pairs"
            value={summary.pairs === 0 ? "—" : `${summary.repeated} of ${summary.pairs}`}
            hint={summary.lastMonthLabel ? `pairs also together in ${summary.lastMonthLabel}` : "No earlier month to compare with"}
          />
          <SummaryCard
            delay={100}
            tone={summary.clashes === 0 ? "good" : "bad"}
            icon={summary.clashes === 0 ? CircleCheck : CircleAlert}
            label="Clashes"
            value={String(summary.clashes)}
            hint={summary.clashes === 0 ? "Nobody twice in a day or over a limit" : "Twice in a day, over a limit, or a rule broken"}
          />
          <SummaryCard
            delay={140}
            tone={summary.spreadMax - summary.spreadMin <= 1 && summary.unused === 0 ? "good" : "neutral"}
            icon={Users}
            label="Load spread"
            value={summary.spreadMax === 0 ? "—" : `${summary.spreadMin}–${summary.spreadMax}`}
            hint={`sessions each${summary.unused ? ` · ${summary.unused} not used` : ""}${!past && summary.unfilled ? ` · ${summary.unfilled} empty` : ""}`}
          />
        </div>
      ) : null}

      {!built && !past ? (
        <div className="rise flex gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-[0.8125rem] text-muted-foreground">
            <span className="font-medium text-foreground">This month isn&apos;t built yet.</span> These are its dates and times after special days.{" "}
            {canEdit ? "Generate fills every session it can, avoiding recent pairs and sharing the load." : "Someone with editing rights can generate it."}
          </p>
        </div>
      ) : null}

      <div key={round} className={cn("grid grid-cols-1 gap-4 transition-opacity", busy === "generate" && "pointer-events-none opacity-60")}>
        {grids.length === 0 ? (
          <div className="rise rounded-2xl border border-border bg-card p-6 text-center text-[0.875rem] text-muted-foreground">
            No locations with slots yet.{" "}
            <Link href="/locations" className="font-medium text-primary underline-offset-4 hover:underline">
              Add one in Locations
            </Link>
            .
          </div>
        ) : (
          grids.map((grid, index) => (
            <MonthGrid
              key={grid.location.id}
              grid={grid}
              index={index}
              interaction={{ badges, editable, inspectable: built, selected, flash, onOpen: setSelected, onSwap: (from, to) => void swap(from, to) }}
            />
          ))
        )}
        {editable ? (
          <p className="hidden text-[0.75rem] text-muted-foreground md:block">Drag one session onto another to swap their people. Locked sessions stay put.</p>
        ) : null}
      </div>

      {built ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Warnings issues={issues} onOpen={setSelected} />
          <Loads loads={loads} past={past} lockedCount={lockedCount} />
        </div>
      ) : null}

      <CellPanel
        month={month}
        session={selectedSession}
        badges={selected ? (badges[selected] ?? []) : []}
        members={members}
        canEdit={canEdit}
        past={past}
        onClose={() => setSelected(null)}
        onChanged={(keys) => refresh(keys)}
      />

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rebuild the unlocked sessions?</DialogTitle>
            <DialogDescription>
              Every session that isn&apos;t locked gets a fresh pair, including ones you changed by hand.{" "}
              {lockedCount > 0 ? `${lockedCount} locked ${lockedCount === 1 ? "session stays" : "sessions stay"} exactly as they are.` : "Lock any you want to keep first."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void generate()}>
              <Repeat2 />
              Regenerate unlocked
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  delay,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "bad" | "neutral";
  delay: number;
}) {
  return (
    <div className="rise rounded-2xl border border-border bg-card p-4 shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <p className="flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg",
            tone === "good" && "bg-primary-soft text-accent-foreground",
            tone === "warn" && "bg-warning text-warning-foreground",
            tone === "bad" && "bg-danger text-danger-foreground",
            tone === "neutral" && "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="size-3.5" />
        </span>
        {label}
      </p>
      <p className="tabular mt-2 font-display text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-[0.75rem] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Warnings({ issues, onOpen }: { issues: IssueLine[]; onOpen: (key: string) => void }) {
  return (
    <section className="rise rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" aria-labelledby="warnings">
      <h2 id="warnings" className="font-display text-base font-semibold tracking-tight">
        Warnings
      </h2>
      {issues.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-[0.8125rem] text-muted-foreground">
          <CircleCheck className="size-4 text-primary" />
          Nothing to look at.
        </p>
      ) : (
        <ul className="mt-3 grid gap-1">
          {issues.map((issue, i) => {
            const Icon = issue.tone === "danger" ? CircleAlert : issue.tone === "warning" ? TriangleAlert : Info;
            const content = (
              <>
                <Icon
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    issue.tone === "danger" && "text-danger-foreground",
                    issue.tone === "warning" && "text-warning-foreground",
                    issue.tone === "info" && "text-muted-foreground"
                  )}
                />
                <span>{issue.text}</span>
              </>
            );
            return (
              <li key={i}>
                {issue.sessionId ? (
                  <button
                    type="button"
                    onClick={() => onOpen(issue.sessionId!)}
                    className="row-hover flex min-h-9 w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[0.8125rem] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 pointer-coarse:min-h-11"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-start gap-2 px-2 py-1.5 text-[0.8125rem]">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Loads({ loads, past, lockedCount }: { loads: LoadRow[]; past: boolean; lockedCount: number }) {
  const used = loads.filter((l) => l.count > 0);
  const unused = loads.filter((l) => l.count === 0);
  return (
    <section className="rise rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5 [animation-delay:60ms]" aria-labelledby="loads">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="loads" className="font-display text-base font-semibold tracking-tight">
          Sessions per person
        </h2>
        {lockedCount > 0 ? <span className="text-[0.75rem] text-muted-foreground">{lockedCount} locked</span> : null}
      </div>
      <ul className="mt-3 grid gap-2">
        {used.map((l, i) => {
          const over = !past && l.count > l.limit;
          const width = past ? Math.min(100, (l.count / Math.max(...used.map((u) => u.count))) * 100) : Math.min(100, (l.count / Math.max(l.limit, 1)) * 100);
          return (
            <li key={l.id} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-[0.8125rem]">
              <span className="truncate" title={l.name}>
                {l.name}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn("bar-grow block h-full rounded-full", over ? "bg-danger-foreground" : "bg-primary")}
                  style={{ width: `${width}%`, animationDelay: `${Math.min(i * 15, 300)}ms` }}
                />
              </span>
              <span className={cn("tabular w-10 text-right text-muted-foreground", over && "font-semibold text-danger-foreground")}>
                {past ? l.count : `${l.count}/${l.limit}`}
              </span>
            </li>
          );
        })}
      </ul>
      {unused.length > 0 && !past ? (
        <p className="mt-3 text-[0.75rem] text-muted-foreground">
          <span className="font-medium text-foreground">Not used: </span>
          {unused.map((l) => l.name).join(", ")}
        </p>
      ) : null}
    </section>
  );
}
