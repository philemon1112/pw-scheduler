"use client";

import * as React from "react";
import { toast } from "sonner";
import { Eraser, Heart, LoaderCircle, Lock, Plus, Sparkles, UserRoundPlus, X } from "lucide-react";

import { setAllowMixedAction, setCellAction, setLockedAction, suggestAction } from "@/app/(app)/schedule/actions";
import { BADGES } from "@/components/schedule/month-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { shortDate } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import type { ViewSession } from "@/lib/schedule/month-view";
import type { SessionSuggestions } from "@/lib/scheduler/suggest";
import type { Badge as CellBadge, Suggestion } from "@/lib/scheduler/types";
import { cn } from "@/lib/utils";

export interface PanelMember {
  id: string;
  name: string;
  title: "Bro" | "Sis";
  active: boolean;
}

export type PanelSession = ViewSession & { locationName: string };

const EXPLAIN: Record<CellBadge, string> = {
  same_day: "Someone here has another session the same day.",
  over_limit: "Someone here is over their monthly limit.",
  unavailable: "Someone here isn't available for this slot (their slots, an away date or a pause).",
  never: "These two are set to be kept apart.",
  mixed: "A Bro and a Sis who aren't a couple. Turn on “Allow mixed pair here” if that's intended.",
  repeat: "This pair also served together last month.",
  twice: "This pair is together more than once this month.",
  couple: "A married couple, serving together.",
};

/**
 * The cell panel (§10.1): who is in a session, why, and what else would
 * work. Suggestions come from the engine (`suggest`), so they never offer
 * someone who is busy that day, over their limit, or not allowed with the
 * other person.
 */
export function CellPanel({
  month,
  session,
  badges,
  members,
  canEdit,
  past,
  onClose,
  onChanged,
}: {
  month: string;
  session: PanelSession | null;
  badges: CellBadge[];
  members: PanelMember[];
  canEdit: boolean;
  past: boolean;
  onClose: () => void;
  onChanged: (keys: string[]) => void;
}) {
  return (
    <Sheet open={session !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-[28rem]">
        {session ? (
          <PanelBody
            key={session.key}
            month={month}
            session={session}
            badges={badges}
            members={members}
            editable={canEdit && !past && !session.isCancelled}
            onChanged={onChanged}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PanelBody({
  month,
  session,
  badges,
  members,
  editable,
  onChanged,
}: {
  month: string;
  session: PanelSession;
  badges: CellBadge[];
  members: PanelMember[];
  editable: boolean;
  onChanged: (keys: string[]) => void;
}) {
  const byId = React.useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const people = session.people ?? [];
  const peopleKey = people.map((p) => p.id).join(",");
  // Suggestions belong to one session with one set of people; anything else is stale.
  const wanted = `${session.key}|${peopleKey}`;
  const [fetched, setFetched] = React.useState<{ key: string; data: SessionSuggestions | null } | null>(null);
  const [pending, setPending] = React.useState<string | null>(null);
  const [pick, setPick] = React.useState("");
  const active = editable && !session.locked;
  const suggestions = fetched?.key === wanted ? fetched.data : null;
  const loading = active && fetched?.key !== wanted;

  React.useEffect(() => {
    if (!active) return;
    let live = true;
    suggestAction(month, session.key)
      .then((result) => {
        if (!live) return;
        setFetched({ key: wanted, data: result.ok ? result.suggestions : null });
        if (!result.ok) toast.error(result.error);
      })
      .catch(() => live && setFetched({ key: wanted, data: null }));
    return () => {
      live = false;
    };
  }, [active, month, session.key, wanted]);

  const act = async (label: string, work: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setPending(label);
    const result = await work().catch(() => ({ ok: false, error: "That didn't go through. Try again." }));
    setPending(null);
    if (!result.ok) return void toast.error(result.error ?? "That didn't go through.");
    toast.success(done);
    onChanged([session.key]);
  };

  const fullName = (id: string) => {
    const m = byId.get(id);
    return m ? `${m.title} ${m.name}` : "Someone";
  };
  const first = (id: string) => byId.get(id)?.name.split(" ")[0] ?? "them";
  const ids = people.map((p) => p.id);

  const setPeople = (next: string[], done: string) => act(`set:${next.join(",")}`, () => setCellAction(session.key, next), done);
  const options = members.filter((m) => m.active && !ids.includes(m.id)).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {shortDate(session.date)} · {formatTimeRange(session.startTime, session.endTime)}
        </SheetTitle>
        <SheetDescription>
          {session.locationName}
          {session.change === "moved" && session.specialDayName ? ` · moved for ${session.specialDayName}` : ""}
        </SheetDescription>
      </SheetHeader>

      <SheetBody className="grid content-start gap-5">
        {session.isCancelled ? (
          <p className="rounded-xl bg-muted px-3.5 py-3 text-[0.8125rem] text-muted-foreground">No session: {session.specialDayName ?? "cancelled"}.</p>
        ) : null}

        {badges.length > 0 ? (
          <ul className="grid gap-1.5">
            {badges.map((b) => (
              <li key={b} className="flex items-start gap-2 text-[0.8125rem]">
                <Badge variant={BADGES[b].tone} size="sm" className="mt-0.5 shrink-0">
                  {b === "couple" ? <Heart /> : null}
                  {BADGES[b].label}
                </Badge>
                <span className="text-muted-foreground">{EXPLAIN[b]}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <section className="grid gap-2" aria-label="People">
          <p className="text-[0.75rem] font-medium tracking-wide text-muted-foreground uppercase">People</p>
          {people.length === 0 ? <p className="text-[0.875rem] text-muted-foreground">Nobody yet.</p> : null}
          {people.map((person, pos) => {
            const instead = suggestions?.replace[person.id] ?? [];
            return (
              <div key={person.id} className="rounded-xl border border-border bg-background/60">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <span className="grow text-[0.9375rem] font-medium">
                    <span className="text-muted-foreground">{person.title}</span> {person.name}
                  </span>
                  {editable && !session.locked ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Take ${person.name} out`}
                      disabled={pending !== null}
                      onClick={() => void setPeople(ids.filter((id) => id !== person.id), `${person.name} taken out`)}
                    >
                      <X />
                    </Button>
                  ) : null}
                </div>
                {editable && !session.locked ? (
                  <div className="border-t border-border/70 px-3 py-2">
                    <p className="mb-1 text-[0.75rem] text-muted-foreground">Could take {first(person.id)}&apos;s place</p>
                    {loading && !suggestions ? <SuggestionSkeleton /> : null}
                    {suggestions && instead.length === 0 ? <p className="text-[0.75rem] text-muted-foreground">Nobody else free that day has a session left this month. Raise the limits, or drag this session onto another to swap.</p> : null}
                    <ul className="grid gap-0.5">
                      {instead.map((s) => (
                        <SuggestionRow
                          key={s.memberIds.join()}
                          suggestion={s}
                          label={fullName(s.memberIds[0])}
                          busy={pending !== null}
                          onPick={() => {
                            const next = [...ids];
                            next[pos] = s.memberIds[0];
                            void setPeople(next, `${byId.get(s.memberIds[0])?.name} in for ${person.name}`);
                          }}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}

          {editable && !session.locked && people.length < 2 ? (
            <div className="rounded-xl border border-dashed border-primary/40 bg-accent/30 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-[0.75rem] font-medium text-accent-foreground">
                <Sparkles className="size-3.5" />
                {people.length === 0 ? "Pairs that would work" : `Who could go with ${first(ids[0])}`}
              </p>
              {loading && !suggestions ? <SuggestionSkeleton /> : null}
              {suggestions && suggestions.fill.length === 0 ? <p className="text-[0.75rem] text-muted-foreground">Nobody free that day has a session left and is allowed here. Choose someone below to override.</p> : null}
              <ul className="grid gap-0.5">
                {(suggestions?.fill ?? []).map((s) => (
                  <SuggestionRow
                    key={s.memberIds.join()}
                    suggestion={s}
                    label={s.memberIds.map(fullName).join(" & ")}
                    busy={pending !== null}
                    onPick={() => void setPeople([...ids, ...s.memberIds], "Session filled")}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {session.reason ? (
          <p className="text-[0.8125rem] text-muted-foreground">
            <span className="font-medium text-foreground">Why: </span>
            {session.reason}
          </p>
        ) : null}

        {editable && !session.locked && people.length < 2 ? (
          <div className="grid gap-1.5">
            <Label htmlFor="cell-pick">Choose someone</Label>
            <div className="flex gap-2">
              <NativeSelect id="cell-pick" value={pick} onChange={(event) => setPick(event.target.value)} className="grow">
                <option value="">Anyone in the members list…</option>
                {options.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} {m.name}
                  </option>
                ))}
              </NativeSelect>
              <Button
                variant="outline"
                disabled={!pick || pending !== null}
                onClick={() => {
                  const id = pick;
                  setPick("");
                  void setPeople([...ids, id], `${byId.get(id)?.name} added`);
                }}
              >
                <UserRoundPlus />
                Add
              </Button>
            </div>
            <p className="text-[0.75rem] text-muted-foreground">A choice that breaks a rule is allowed, and shows as a warning.</p>
          </div>
        ) : null}

        {editable ? (
          <div className="grid gap-3 rounded-xl bg-muted/60 p-3.5">
            <label className="flex items-start justify-between gap-3" htmlFor="cell-lock">
              <span>
                <span className="flex items-center gap-1.5 text-[0.875rem] font-medium">
                  <Lock className="size-3.5" />
                  Lock this pair
                </span>
                <span className="block text-[0.75rem] text-muted-foreground">Regenerate keeps it exactly, and it counts toward their limits.</span>
              </span>
              <Switch
                id="cell-lock"
                checked={session.locked}
                disabled={people.length === 0 || pending !== null}
                onCheckedChange={(value) => void act("lock", () => setLockedAction(session.key, value), value ? "Locked" : "Unlocked")}
              />
            </label>
            <label className="flex items-start justify-between gap-3" htmlFor="cell-mixed">
              <span>
                <span className="block text-[0.875rem] font-medium">Allow mixed pair here</span>
                <span className="block text-[0.75rem] text-muted-foreground">
                  {people.length === 0 ? "Place someone first." : "A Bro with a Sis who aren't a couple, for this session only."}
                </span>
              </span>
              <Switch
                id="cell-mixed"
                checked={session.allowMixed}
                disabled={people.length === 0 || session.locked || pending !== null}
                onCheckedChange={(value) => void act("mixed", () => setAllowMixedAction(session.key, value), value ? "Mixed pair allowed here" : "Mixed pair no longer allowed")}
              />
            </label>
          </div>
        ) : null}
      </SheetBody>

      {editable && people.length > 0 && !session.locked ? (
        <SheetFooter>
          <Button variant="ghost" className="w-full text-danger-foreground" disabled={pending !== null} onClick={() => void setPeople([], "Session cleared")}>
            {pending === "set:" ? <LoaderCircle className="animate-spin" /> : <Eraser />}
            Clear this session
          </Button>
        </SheetFooter>
      ) : null}
    </>
  );
}

function SuggestionRow({ suggestion, label, busy, onPick }: { suggestion: Suggestion; label: string; busy: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={onPick}
        className={cn(
          "row-hover flex min-h-11 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left outline-none",
          "focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60"
        )}
      >
        <Plus className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 grow">
          <span className="block text-[0.8125rem] font-medium">{label}</span>
          <span className="block text-[0.75rem] text-muted-foreground">{suggestion.reason}</span>
        </span>
      </button>
    </li>
  );
}

function SuggestionSkeleton() {
  return (
    <div className="grid gap-1.5 py-1" aria-label="Loading suggestions">
      {[0, 1, 2].map((i) => (
        <span key={i} className="shimmer h-9 rounded-lg" />
      ))}
    </div>
  );
}
