"use client";

import { ArrowRight, CircleSlash, Plus, TriangleAlert } from "lucide-react";

import { addDays, monthOf, shortDate } from "@/lib/dates/calendar";
import { nextOccurrence, overlapping, resolveMonthSessions, type MonthSettings, type SlotDef } from "@/lib/dates/sessions";
import type { SpecialDayRule } from "@/lib/dates/special-days";
import { formatTimeRange } from "@/lib/dates/time";
import { cn } from "@/lib/utils";

export interface PreviewLocation {
  id: string;
  key: string;
  name: string;
  slots: SlotDef[];
}

/**
 * The live preview (§7): what this rule does, slot by slot, on the next day
 * it applies — "Result for Sat 5 Dec 2026". Run through the same resolver
 * the generator uses, so the preview can't disagree with the schedule.
 */
export function RulePreview({ rule, locations, settings, today }: { rule: SpecialDayRule; locations: PreviewLocation[]; settings: MonthSettings; today: string }) {
  const first = nextOccurrence(rule, today);
  if (!first) {
    return <p className="rounded-xl bg-muted px-3.5 py-3 text-[0.8125rem] text-muted-foreground">Pick a date to see what it does.</p>;
  }

  // Up to three days of a range, each resolved in its own month.
  const days: string[] = [first];
  if (rule.kind === "one_off" && rule.endDate) {
    for (let d = first; days.length < 3; ) {
      const next = addDays(d, 1);
      if (next > rule.endDate) break;
      days.push(next);
      d = next;
    }
  }

  const slots = locations.flatMap((l) => l.slots);
  const all = days.flatMap((date) => resolveMonthSessions(monthOf(date), slots, [{ ...rule, active: true }], settings).filter((s) => s.date === date));
  const clashes = overlapping(all);
  const nameOf = new Map(locations.map((l) => [l.id, l]));

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-background/70 p-3.5" aria-live="polite">
      <p className="text-[0.8125rem] font-semibold">
        Result for {days.map((d) => shortDate(d)).join(", ")} {first.slice(0, 4)}
      </p>
      {all.length === 0 ? (
        <p className="text-[0.8125rem] text-muted-foreground">No slots fall on that day, so nothing changes.</p>
      ) : (
        locations
          .filter((l) => all.some((s) => s.locationId === l.id))
          .map((location) => (
            <div key={location.id} className="grid gap-1.5">
              <p className="flex items-center gap-2 text-[0.75rem] font-medium text-muted-foreground">
                <span className={cn("size-2 rounded-full", location.key === "mtn" ? "bg-mtn" : location.key === "police" ? "bg-police" : "bg-primary")} aria-hidden />
                {nameOf.get(location.id)?.name}
              </p>
              <ul className="grid gap-1">
                {all
                  .filter((s) => s.locationId === location.id)
                  .map((s) => (
                    <li key={s.key} className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
                      {days.length > 1 ? <span className="w-16 text-muted-foreground">{shortDate(s.date).split(" ")[0]}</span> : null}
                      {s.change === "added" ? (
                        <span className="inline-flex items-center gap-1.5 font-medium text-accent-foreground">
                          <Plus className="size-3.5" />
                          New: {formatTimeRange(s.startTime, s.endTime)}
                        </span>
                      ) : (
                        <>
                          <span className={cn("tabular", s.change !== "none" && "text-muted-foreground line-through decoration-1")}>{formatTimeRange(s.originalStart, s.originalEnd)}</span>
                          {s.isCancelled ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[0.75rem] italic text-muted-foreground">
                              <CircleSlash className="size-3" />
                              No session
                            </span>
                          ) : s.change === "moved" ? (
                            <>
                              <ArrowRight className="size-3.5 text-muted-foreground" />
                              <span className="tabular font-medium text-accent-foreground">{formatTimeRange(s.startTime, s.endTime)}</span>
                            </>
                          ) : (
                            <span className="text-[0.75rem] text-muted-foreground">unchanged</span>
                          )}
                        </>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))
      )}
      {clashes.length > 0 ? (
        <p className="flex gap-2 rounded-lg border border-warning-border bg-warning px-3 py-2 text-[0.75rem] text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {clashes.length === 1 ? "Two sessions" : `${clashes.length} pairs of sessions`} at the same place now overlap. They would both need people at the same time.
        </p>
      ) : null}
    </div>
  );
}
