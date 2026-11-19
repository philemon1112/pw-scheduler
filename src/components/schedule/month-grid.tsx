"use client";

import * as React from "react";
import { ArrowRight, CircleSlash, Heart, Lock, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { shortDate, WEEKDAY_NAMES } from "@/lib/dates/calendar";
import { formatTime, formatTimeRange } from "@/lib/dates/time";
import type { GridColumn, LocationGrid, ViewSession } from "@/lib/schedule/month-view";
import type { Badge as CellBadge } from "@/lib/scheduler/types";
import { cn } from "@/lib/utils";

const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthShort = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
const dayLabel = (iso: string) => shortDate(iso).split(" ").slice(0, 2).join(" ");

/** "3 – 8 Nov", or "28 Nov – 1 Dec" when it crosses a month. */
const rangeLabel = (from: string, to: string) =>
  from === to ? `${dayNum(from)} ${monthShort(from)}` : from.slice(0, 7) === to.slice(0, 7) ? `${dayNum(from)} – ${dayNum(to)} ${monthShort(to)}` : `${dayNum(from)} ${monthShort(from)} – ${dayNum(to)} ${monthShort(to)}`;

const columnLabel = (c: GridColumn) => ({ day: WEEKDAY_NAMES[c.weekday].slice(0, 3), time: formatTimeRange(c.startTime, c.endTime) });

/** Badge text: colour is never the only signal (§15). */
export const BADGES: Record<CellBadge, { label: string; tone: "danger" | "warning" | "accent" }> = {
  same_day: { label: "Same day", tone: "danger" },
  over_limit: { label: "Over limit", tone: "danger" },
  unavailable: { label: "Not available", tone: "danger" },
  never: { label: "Kept apart", tone: "danger" },
  mixed: { label: "Mixed", tone: "warning" },
  repeat: { label: "Repeat", tone: "warning" },
  twice: { label: "Twice", tone: "warning" },
  couple: { label: "Couple", tone: "accent" },
};
const SEVERITY: CellBadge[] = ["same_day", "over_limit", "unavailable", "never", "mixed", "repeat", "twice", "couple"];

export interface GridInteraction {
  badges: Record<string, CellBadge[]>;
  /** Cells open the panel and can be dragged. */
  editable: boolean;
  /** Cells open the panel, read-only (a past month, or a viewer). */
  inspectable: boolean;
  selected: string | null;
  flash: ReadonlySet<string>;
  onOpen: (key: string) => void;
  onSwap: (from: string, to: string) => void;
}

interface DragState {
  dragging: string | null;
  over: string | null;
  setDragging: (key: string | null) => void;
  setOver: (key: string | null) => void;
}

/**
 * One location's month, laid out like the printed sheet: weeks down, slots
 * across. A table from tablet width up; on a phone the same weeks become a
 * list, because seven columns of names don't fit in 390px.
 */
export function MonthGrid({ grid, index, interaction }: { grid: LocationGrid; index: number; interaction?: GridInteraction }) {
  const { location, columns, weeks } = grid;
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const drag: DragState = { dragging, over, setDragging, setOver };

  return (
    <section className="rise min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-card" style={{ animationDelay: `${index * 60}ms` }} aria-labelledby={`loc-${location.id}`}>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: location.pdfColor }} aria-hidden />
        <h2 id={`loc-${location.id}`} className="font-display text-base font-semibold tracking-tight">
          {location.name}
        </h2>
        <span className="ml-auto text-[0.75rem] text-muted-foreground">
          {columns.length} {columns.length === 1 ? "slot" : "slots"} a week
        </span>
      </header>

      {weeks.length === 0 ? (
        <p className="px-5 py-6 text-[0.8125rem] text-muted-foreground">No sessions this month.</p>
      ) : (
        <>
          {/* Tablet and up: the sheet's table. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-[0.75rem] text-muted-foreground">
                  <th scope="col" className="w-32 px-4 py-2.5 font-medium">
                    Week
                  </th>
                  {columns.map((c) => {
                    const { day, time } = columnLabel(c);
                    return (
                      <th key={c.slotId} scope="col" className="min-w-36 px-3 py-2.5 font-medium">
                        <span className="block text-foreground">{day}</span>
                        <span className="tabular">{time}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week, w) => (
                  <tr key={week.index} className="border-t border-border/70 align-top">
                    <th scope="row" className="px-4 py-3 text-[0.8125rem] font-medium">
                      Week {week.index}
                      <span className="tabular block text-[0.75rem] font-normal text-muted-foreground">{rangeLabel(week.from, week.to)}</span>
                      {week.extras.map((extra) => (
                        <div key={extra.key} className="mt-2 text-left font-normal">
                          <Badge variant="accent" size="sm" className="mb-1">
                            <Plus />
                            Extra
                          </Badge>
                          <Cell session={extra} interaction={interaction} drag={drag} withTime />
                        </div>
                      ))}
                    </th>
                    {week.cells.map((cell, c) => (
                      <td key={columns[c].slotId} className="cell-in px-1.5 py-1.5" style={{ animationDelay: `${Math.min((w * columns.length + c) * 8, 200)}ms` }}>
                        {cell ? <Cell session={cell} interaction={interaction} drag={drag} /> : <span className="block px-2 py-2 text-[0.75rem] text-muted-foreground/60">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: the same weeks as a list. */}
          <ol className="grid md:hidden">
            {weeks.map((week) => (
              <li key={week.index} className="border-t border-border/70 px-3 py-3 first:border-t-0">
                <p className="mb-2 flex items-baseline justify-between px-1 text-[0.8125rem] font-semibold">
                  Week {week.index}
                  <span className="tabular text-[0.75rem] font-normal text-muted-foreground">{rangeLabel(week.from, week.to)}</span>
                </p>
                <ul className="grid gap-1">
                  {[...week.cells.filter((c): c is ViewSession => c !== null), ...week.extras]
                    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
                    .map((session) => (
                      <li key={session.key} className="flex items-start gap-2">
                        <span className="tabular w-14 shrink-0 pt-2.5 pl-1 text-[0.75rem] text-muted-foreground">{dayLabel(session.date)}</span>
                        <div className="min-w-0 grow">
                          <Cell session={session} interaction={interaction} drag={drag} withTime />
                        </div>
                      </li>
                    ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function Cell({ session, withTime = false, interaction, drag }: { session: ViewSession; withTime?: boolean; interaction?: GridInteraction; drag: DragState }) {
  const badges = [...(interaction?.badges[session.key] ?? [])].sort((a, b) => SEVERITY.indexOf(a) - SEVERITY.indexOf(b));
  const danger = badges.some((b) => BADGES[b].tone === "danger");
  const moved = session.change === "moved";
  const filled = (session.people?.length ?? 0) > 0;

  if (session.isCancelled) {
    return (
      <div className="rounded-lg bg-muted/80 px-2.5 py-2 text-[0.75rem] italic text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CircleSlash className="size-3 shrink-0" />
          No session
        </span>
        {session.specialDayName ? <span className="mt-0.5 block not-italic">{session.specialDayName}</span> : null}
        {withTime ? <span className="tabular mt-0.5 block not-italic line-through decoration-1">{formatTimeRange(session.originalStart, session.originalEnd)}</span> : null}
      </div>
    );
  }

  const canOpen = !!interaction && (interaction.editable || interaction.inspectable);
  const canDrag = !!interaction?.editable && filled && !session.locked;
  const canDrop = !!interaction?.editable && !session.locked && drag.dragging !== null && drag.dragging !== session.key;

  const body = (
    <>
      {withTime || moved ? (
        <span className="tabular flex flex-wrap items-center gap-1 text-[0.75rem]">
          {moved ? (
            <>
              <span className="text-muted-foreground line-through decoration-1">{formatTime(session.originalStart)}</span>
              <ArrowRight className="size-3 text-muted-foreground" />
              <span className="font-medium text-accent-foreground">{formatTimeRange(session.startTime, session.endTime)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{formatTimeRange(session.startTime, session.endTime)}</span>
          )}
          {withTime && session.locked ? <Lock className="ml-auto size-3 text-foreground" aria-hidden /> : null}
        </span>
      ) : null}
      {!withTime ? (
        <span className="tabular flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          {dayLabel(session.date)}
          {session.locked ? <Lock className="ml-auto size-3 text-foreground" aria-hidden /> : null}
        </span>
      ) : null}
      <People session={session} />
      {badges.length > 0 ? (
        <span className="mt-1 flex flex-wrap gap-1">
          {badges.map((b) => (
            <Badge key={b} variant={BADGES[b].tone} size="sm">
              {b === "couple" ? <Heart /> : null}
              {BADGES[b].label}
            </Badge>
          ))}
        </span>
      ) : null}
      {moved && session.specialDayName ? <span className="mt-0.5 block text-[0.6875rem] text-accent-foreground">{session.specialDayName}</span> : null}
    </>
  );

  const className = cn(
    "block w-full rounded-lg border px-2.5 py-2 text-left transition-[background-color,border-color,box-shadow,opacity] duration-150",
    danger ? "border-danger-border bg-danger/50" : moved ? "border-transparent bg-accent/70" : "border-transparent",
    canOpen && "row-hover cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
    interaction?.selected === session.key && "border-primary bg-accent/50 shadow-card",
    interaction?.flash.has(session.key) && "flash",
    drag.dragging === session.key && "opacity-50",
    drag.over === session.key && canDrop && "border-dashed border-primary bg-accent/60"
  );

  if (!canOpen) return <div className={className}>{body}</div>;

  const people = session.people?.map((p) => `${p.title} ${p.name}`).join(" and ") || "nobody yet";
  const label = `${shortDate(session.date)}, ${formatTimeRange(session.startTime, session.endTime)}: ${people}${badges.length ? `. ${badges.map((b) => BADGES[b].label).join(", ")}` : ""}${session.locked ? ". Locked" : ""}`;

  return (
    <button
      type="button"
      className={className}
      onClick={() => interaction!.onOpen(session.key)}
      aria-label={label}
      draggable={canDrag}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", session.key);
        event.dataTransfer.effectAllowed = "move";
        drag.setDragging(session.key);
      }}
      onDragEnd={() => {
        drag.setDragging(null);
        drag.setOver(null);
      }}
      onDragOver={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (drag.over !== session.key) drag.setOver(session.key);
      }}
      onDragLeave={() => drag.over === session.key && drag.setOver(null)}
      onDrop={(event) => {
        event.preventDefault();
        const from = event.dataTransfer.getData("text/plain");
        drag.setDragging(null);
        drag.setOver(null);
        if (from && from !== session.key) interaction!.onSwap(from, session.key);
      }}
    >
      {body}
    </button>
  );
}

function People({ session }: { session: ViewSession }) {
  if (!session.people || session.people.length === 0) {
    return <span className="mt-0.5 block text-[0.8125rem] text-muted-foreground/70">Not filled</span>;
  }
  return (
    <span className="mt-0.5 grid gap-0.5 text-[0.8125rem] leading-snug">
      {session.people.map((p) => (
        <span key={p.id} className="break-words">
          <span className="text-muted-foreground">{p.title}</span> {p.name}
        </span>
      ))}
      {session.people.length === 1 ? <span className="text-[0.75rem] text-warning-foreground">Needs a second person</span> : null}
    </span>
  );
}
