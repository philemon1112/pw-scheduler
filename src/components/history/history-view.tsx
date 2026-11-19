"use client";

import * as React from "react";
import Link from "next/link";
import { FileUp, Heart, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { HistoryPerson, HistorySession } from "@/db/queries/history";
import { monthLabel, shortDate } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { monthComparison, pairOf, pairStats } from "@/lib/history";
import { cn } from "@/lib/utils";

type Tab = "pairs" | "people" | "months";
const plain = (name: string) => name.replace(/^(Bro|Sis) /, "");
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/**
 * History (§9): who has served with whom (a matrix, searchable), one
 * person's timeline, and how much a month repeats the one before it.
 */
export function HistoryView({ sessions, people, months, canImport }: { sessions: HistorySession[]; people: HistoryPerson[]; months: string[]; canImport: boolean }) {
  const [tab, setTab] = React.useState<Tab>("pairs");
  const [query, setQuery] = React.useState("");
  const [person, setPerson] = React.useState<string | null>(null);
  const stats = React.useMemo(() => pairStats(sessions), [sessions]);
  const nameOf = React.useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const shown = people.filter((p) => !query || p.name.toLowerCase().includes(query.trim().toLowerCase()));
  const max = Math.max(1, ...[...stats.values()].map((s) => s.count));

  if (sessions.length === 0) {
    return (
      <div className="rise rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center">
        <p className="text-[0.9375rem] font-medium">No history yet</p>
        <p className="mt-1 text-[0.8125rem] text-muted-foreground">Run the seed, import an old sheet, or publish a month.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rise flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="History">
          {(
            [
              ["pairs", "Pairs"],
              ["people", "People"],
              ["months", "Months"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              type="button"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "min-h-9 rounded-lg px-4 text-[0.8125rem] font-medium transition-[background-color,box-shadow] pointer-coarse:min-h-11",
                "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                tab === key ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {canImport ? (
          <Button asChild variant="outline">
            <Link href="/history/import">
              <FileUp />
              Import an old sheet
            </Link>
          </Button>
        ) : null}
      </div>

      {tab !== "months" ? (
        <div className="rise relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a name" aria-label="Search a name" className="pl-9" />
        </div>
      ) : null}

      {tab === "pairs" ? (
        <>
          {/* Desktop: the matrix. */}
          <div className="rise hidden max-h-[70vh] overflow-auto rounded-2xl border border-border bg-card shadow-card md:block">
            <table className="border-separate border-spacing-0 text-[0.75rem]">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 min-w-44 border-b border-border bg-card" />
                  {people.map((p) => (
                    <th key={p.id} scope="col" className="sticky top-0 z-10 h-32 border-b border-border bg-card px-0.5 align-bottom">
                      <span className="block max-h-30 rotate-180 truncate pb-1 font-normal text-muted-foreground [writing-mode:vertical-rl]" title={p.name}>
                        {plain(p.name)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="sticky left-0 z-10 border-r border-border bg-card px-3 py-0.5 text-left font-medium whitespace-nowrap">
                      <button type="button" onClick={() => (setPerson(row.id), setTab("people"))} className="hover:underline">
                        {plain(row.name)}
                      </button>
                    </th>
                    {people.map((col) => {
                      const stat = row.id === col.id ? null : pairOf(stats, row.id, col.id);
                      return (
                        <td key={col.id} className="p-px">
                          <span
                            className={cn("flex size-6 items-center justify-center rounded-[4px] tabular", stat ? "text-foreground" : "text-transparent", row.id === col.id && "bg-muted")}
                            style={stat ? { backgroundColor: stat.isCouple ? "var(--accent)" : `color-mix(in oklab, var(--primary) ${Math.round(15 + (stat.count / max) * 55)}%, transparent)` } : undefined}
                            title={stat ? `${plain(row.name)} & ${plain(col.name)}: ${stat.count}× (${stat.months.map(shortMonth).join(", ")})${stat.isCouple ? " · couple" : ""}` : undefined}
                          >
                            {stat ? stat.count : "·"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phone: each person's partners. */}
          <ul className="grid gap-2 md:hidden">
            {shown.map((p) => {
              const partners = [...stats.values()].filter((s) => s.a === p.id || s.b === p.id).sort((x, y) => y.count - x.count);
              return (
                <li key={p.id} className="rounded-2xl border border-border bg-card p-3 shadow-card">
                  <p className="text-[0.875rem] font-semibold">{p.name}</p>
                  <p className="mt-1 text-[0.8125rem] text-muted-foreground">
                    {partners.length === 0
                      ? "No pairs yet"
                      : partners.map((s) => `${plain(nameOf.get(s.a === p.id ? s.b : s.a) ?? "?")} ${s.count}×`).join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="hidden text-[0.75rem] text-muted-foreground md:block">Darker means more often together. Couples are shaded light. Hover a square for the months; click a name for their timeline.</p>
        </>
      ) : null}

      {tab === "people" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
          <ul className="rise grid max-h-[60vh] content-start gap-0.5 overflow-auto rounded-2xl border border-border bg-card p-1.5 shadow-card">
            {shown.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPerson(p.id)}
                  aria-current={person === p.id}
                  className={cn("row-hover min-h-10 w-full rounded-lg px-3 text-left text-[0.8125rem] pointer-coarse:min-h-11", person === p.id && "bg-accent/60 font-medium")}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
          <Timeline person={person} sessions={sessions} nameOf={nameOf} />
        </div>
      ) : null}

      {tab === "months" ? <Months sessions={sessions} months={months} nameOf={nameOf} /> : null}
    </div>
  );
}

function Timeline({ person, sessions, nameOf }: { person: string | null; sessions: HistorySession[]; nameOf: Map<string, string> }) {
  if (!person) return <p className="rise text-[0.8125rem] text-muted-foreground">Choose someone to see every session they&apos;ve served.</p>;
  const mine = sessions.filter((s) => s.memberIds.includes(person));
  const months = [...new Set(mine.map((s) => s.month))].sort().reverse();
  return (
    <section className="rise grid content-start gap-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" aria-label="Timeline">
      <h2 className="font-display text-base font-semibold">
        {nameOf.get(person)} · {mine.length} {mine.length === 1 ? "session" : "sessions"}
      </h2>
      {months.map((m) => (
        <div key={m}>
          <p className="mb-1.5 text-[0.75rem] font-medium tracking-wide text-muted-foreground uppercase">{monthLabel(m)}</p>
          <ul className="grid gap-1 border-l-2 border-primary/30 pl-3">
            {mine
              .filter((s) => s.month === m)
              .map((s, i) => (
                <li key={i} className="text-[0.8125rem]">
                  <span className="tabular font-medium">{shortDate(s.date)}</span> · {formatTimeRange(s.startTime, s.endTime)} · {s.location}
                  <span className="text-muted-foreground">
                    {" "}
                    · with {s.memberIds.filter((id) => id !== person).map((id) => nameOf.get(id) ?? "someone").join(" & ") || "nobody"}
                  </span>
                  {s.isCouple ? <Heart className="ml-1 inline size-3 text-accent-foreground" aria-label="couple" /> : null}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Months({ sessions, months, nameOf }: { sessions: HistorySession[]; months: string[]; nameOf: Map<string, string> }) {
  const [month, setMonth] = React.useState(months[months.length - 1]);
  const index = months.indexOf(month);
  const previous = index > 0 ? months[index - 1] : null;
  const result = previous ? monthComparison(sessions, month, previous) : null;
  return (
    <section className="rise grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" aria-label="Month comparison">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="cmp-month" className="text-[0.8125rem] text-muted-foreground">
          Compare
        </label>
        <NativeSelect id="cmp-month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-48">
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </NativeSelect>
        <span className="text-[0.8125rem] text-muted-foreground">{previous ? `with ${monthLabel(previous)}` : "— the first month, nothing before it"}</span>
      </div>
      {result ? (
        <>
          <p className="font-display text-2xl font-semibold tabular">
            {result.repeated} of {result.pairs} <span className="text-base font-normal text-muted-foreground">pairs repeated from {shortMonth(previous!)}</span>
          </p>
          <ul className="grid gap-1 text-[0.8125rem]">
            {result.sessions.map((s, i) => (
              <li key={i}>
                <span className="tabular">{shortDate(s.date)}</span> · {s.memberIds.map((id) => nameOf.get(id) ?? "someone").join(" & ")}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
