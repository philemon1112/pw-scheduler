"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BadgeCheck, Heart, LoaderCircle, PauseCircle, Plus, Search, Users } from "lucide-react";

import { confirmAllTitlesAction } from "@/app/(app)/members/actions";
import { EmptyState } from "@/components/empty-state";
import { LimitsDialog } from "@/components/members/limits-dialog";
import { MemberSheet } from "@/components/members/member-sheet";
import type { Limits, LocationOption, MemberRow } from "@/components/members/types";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { monthLabel } from "@/lib/dates/calendar";
import { AVAILABILITY_LABELS } from "@/lib/members/input";
import { monthlyLimit, PRIVILEGE_LABELS, PRIVILEGES } from "@/lib/members/limits";
import { cn } from "@/lib/utils";

type Filter = "all" | "Bro" | "Sis" | "unconfirmed" | "paused";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Everyone" },
  { id: "Bro", label: "Brothers" },
  { id: "Sis", label: "Sisters" },
  { id: "unconfirmed", label: "Title unconfirmed" },
  { id: "paused", label: "Paused or inactive" },
];

/**
 * The Members screen (§10.3).
 *
 * A list, not a grid of cards: forty people are read by scanning a column of
 * names. Each row says the three things a rota-maker looks for — how many
 * sessions this month against their limit, who with, and how they can be
 * placed — and opens the editor. On a phone the same rows stack.
 */
export function MembersView({
  members,
  locations,
  limits,
  month,
  canEdit,
  isOwner,
  initialQuery = "",
}: {
  members: MemberRow[];
  locations: LocationOption[];
  limits: Limits;
  month: string;
  canEdit: boolean;
  isOwner: boolean;
  /** From `?q=`, e.g. "Add number" in Messages: an exact name opens that person straight away. */
  initialQuery?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [editing, setEditing] = React.useState<MemberRow | "new" | null>(
    () => (initialQuery && members.find((m) => m.displayName.toLowerCase() === initialQuery.toLowerCase())) || null
  );
  const [limitsOpen, setLimitsOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const unconfirmed = members.filter((m) => !m.titleConfirmed).length;
  const locationKeys = new Map(locations.map((l) => [l.key, l.name]));
  const today = new Date().toISOString().slice(0, 10);
  const paused = (m: MemberRow) => !m.active || (m.pausedUntil !== null && m.pausedUntil >= today);

  const shown = members.filter((m) => {
    const q = query.trim().toLowerCase();
    if (q && !`${m.displayName} ${m.phoneE164 ?? ""}`.toLowerCase().includes(q)) return false;
    if (filter === "Bro" || filter === "Sis") return m.title === filter;
    if (filter === "unconfirmed") return !m.titleConfirmed;
    if (filter === "paused") return paused(m);
    return true;
  });

  const confirmAll = async () => {
    setConfirming(true);
    const result = await confirmAllTitlesAction().catch(() => null);
    setConfirming(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save. Check your connection and try again.");
    toast.success(`${result.count} ${result.count === 1 ? "title" : "titles"} confirmed`);
    router.refresh();
  };

  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} people · sessions shown for ${monthLabel(month)}`}
        action={
          canEdit ? (
            <Button onClick={() => setEditing("new")}>
              <Plus />
              Add member
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {/* The limits strip: what each privilege may be given in a month. */}
        <div className="rise flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-card sm:px-4">
          <span className="mr-1 text-[0.8125rem] font-medium text-muted-foreground">Monthly limits</span>
          {PRIVILEGES.map((privilege) => (
            <Badge key={privilege} variant="outline" className="tabular">
              {PRIVILEGE_LABELS[privilege]} · {limits[privilege]}
            </Badge>
          ))}
          {isOwner ? (
            <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setLimitsOpen(true)}>
              Change limits
            </Button>
          ) : null}
        </div>

        {unconfirmed > 0 ? (
          <div className="rise flex flex-col gap-3 rounded-2xl border border-warning-border bg-warning px-4 py-3 text-warning-foreground [animation-delay:40ms] sm:flex-row sm:items-center">
            <p className="flex min-w-0 flex-1 gap-3 text-[0.8125rem]">
              <BadgeCheck className="mt-0.5 size-4 shrink-0" />
              <span>
              <span className="font-semibold">{unconfirmed} {unconfirmed === 1 ? "title is" : "titles are"} unconfirmed.</span> Bro and Sis were
              guessed from first names. They decide who can be paired, so check them.
              </span>
            </p>
            {canEdit ? (
              <div className="flex gap-2">
                <Button size="sm" variant="bordered" onClick={() => setFilter("unconfirmed")}>
                  Review
                </Button>
                <Button size="sm" variant="inverted" disabled={confirming} onClick={() => void confirmAll()}>
                  {confirming ? <LoaderCircle className="animate-spin" /> : null}
                  All correct
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or number"
              aria-label="Search members"
              className="pl-9"
            />
          </div>
          <div className="no-scrollbar -mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter members">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "h-9 shrink-0 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors duration-150 ease-[var(--ease-out)] pointer-coarse:h-11",
                  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  filter === item.id ? "border-inverted bg-inverted text-inverted-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={Users}
            title={members.length === 0 ? "No members yet" : "Nobody matches that"}
            hint={members.length === 0 ? "Run `pnpm db:seed` to bring in everyone from your schedules, or add people one by one." : "Try another name, or clear the filter."}
            className="bg-card"
            action={
              members.length === 0 && canEdit ? (
                <Button onClick={() => setEditing("new")}>
                  <Plus />
                  Add member
                </Button>
              ) : filter !== "all" || query ? (
                <Button variant="outline" onClick={() => (setQuery(""), setFilter("all"))}>
                  Show everyone
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="hidden grid-cols-[minmax(14rem,1.6fr)_minmax(8rem,0.9fr)_minmax(9rem,0.9fr)_minmax(8rem,0.8fr)_minmax(10rem,1.4fr)_minmax(8rem,0.8fr)] gap-4 border-b border-border px-4 py-2.5 text-[0.75rem] font-medium text-muted-foreground lg:grid">
              <span>Name</span>
              <span>Privilege</span>
              <span>Locations</span>
              <span>This month</span>
              <span>Partners this month</span>
              <span>Availability</span>
            </div>
            <ul className="divide-y divide-border">
              {shown.map((member, index) => {
                // Everything below `lg` stacks; the grid needs `grid-cols-1`
                // (minmax(0,1fr)) or a long partner list widens the page.
                const limit = monthlyLimit(member, limits);
                const over = member.month.sessions > limit;
                return (
                  <li key={member.id} className="rise" style={{ animationDelay: `${Math.min(index, 14) * 18}ms` }}>
                    <button
                      type="button"
                      onClick={() => setEditing(member)}
                      className="row-hover grid w-full grid-cols-1 gap-x-4 gap-y-1.5 px-4 py-3 text-left outline-none focus-visible:bg-muted lg:grid-cols-[minmax(14rem,1.6fr)_minmax(8rem,0.9fr)_minmax(9rem,0.9fr)_minmax(8rem,0.8fr)_minmax(10rem,1.4fr)_minmax(8rem,0.8fr)] lg:items-center"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        {/* An unconfirmed title is a dashed outline with a "?" —
                            visible on every row without a badge pushing the
                            name onto two lines. */}
                        <span
                          title={member.titleConfirmed ? undefined : "Title not confirmed yet"}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold",
                            member.title === "Bro" ? "bg-mtn-soft text-[#1f4f8f]" : "bg-police-soft text-[#1d5c3e]",
                            !member.titleConfirmed && "border border-dashed border-warning-foreground/50 bg-warning text-warning-foreground"
                          )}
                        >
                          {member.title}
                          {member.titleConfirmed ? null : <span aria-label="not confirmed">?</span>}
                        </span>
                        <span className="min-w-0 truncate text-[0.875rem] font-medium">{member.displayName}</span>
                        {member.partnerId ? (
                          <span title={member.coupleLabel ?? "Couple"} className="inline-flex shrink-0 items-center text-[#b3416b]">
                            <Heart className="size-3.5 fill-current" />
                            <span className="sr-only">Couple: {member.coupleLabel}</span>
                          </span>
                        ) : null}
                        {paused(member) ? (
                          <Badge variant="secondary" size="sm">
                            <PauseCircle />
                            {member.active ? "Paused" : "Inactive"}
                          </Badge>
                        ) : null}
                      </span>
                      {/* On a phone these three share one line; from `lg` they are
                          table columns (`contents` hands them to the grid). */}
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 lg:contents">
                      <span className="text-[0.8125rem] text-muted-foreground">{PRIVILEGE_LABELS[member.privilege]}</span>
                      <span className="flex flex-wrap gap-1">
                        {member.month.locationKeys.length === 0 ? (
                          <span className="text-[0.8125rem] text-muted-foreground">—</span>
                        ) : (
                          member.month.locationKeys.map((key) => (
                            <Badge key={key} variant={key === "mtn" ? "mtn" : "police"} size="sm">
                              {locationKeys.get(key)?.split(/\s[–-]\s/)[0] ?? key}
                            </Badge>
                          ))
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn("tabular whitespace-nowrap text-[0.8125rem] font-medium", over && "text-danger-foreground")}>
                          {member.month.sessions} of {limit}
                        </span>
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <span
                            className={cn("bar-grow block h-full rounded-full", over ? "bg-destructive" : "bg-primary")}
                            style={{ width: `${Math.min(100, limit > 0 ? (member.month.sessions / limit) * 100 : member.month.sessions > 0 ? 100 : 0)}%` }}
                          />
                        </span>
                        {over ? <Badge variant="danger" size="sm">Over</Badge> : null}
                      </span>
                      </span>
                      <span className="truncate text-[0.8125rem] text-muted-foreground">
                        <span className="lg:hidden">With </span>
                        {member.month.partners.join(", ") || "—"}
                      </span>
                      <span className="hidden text-[0.8125rem] text-muted-foreground lg:block">{AVAILABILITY_LABELS[member.availabilityMode]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <MemberSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        member={editing === "new" ? null : editing}
        members={members}
        locations={locations}
        limits={limits}
        canEdit={canEdit}
      />
      {isOwner ? <LimitsDialog open={limitsOpen} onOpenChange={setLimitsOpen} limits={limits} /> : null}
    </>
  );
}
