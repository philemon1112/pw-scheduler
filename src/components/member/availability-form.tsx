"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";

import { saveAvailabilityAction } from "@/app/m/[token]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Mode = "specific" | "flexible" | "ask_monthly";

export interface SlotGroup {
  location: string;
  slots: { id: string; label: string }[];
}

const MODES: { key: Mode; title: string; hint: string }[] = [
  { key: "flexible", title: "Any slot", hint: "Put me wherever I'm needed." },
  { key: "specific", title: "Only these slots", hint: "Tick the times that suit you." },
  { key: "ask_monthly", title: "Ask me each month", hint: "I'll confirm month by month." },
];

/** A member's availability, set from their own link: how to be scheduled, which slots, and away dates. */
export function AvailabilityForm({
  token,
  initial,
  groups,
  months,
}: {
  token: string;
  initial: { mode: Mode; slotIds: string[]; away: { start: string; end: string; reason: string }[]; confirmedMonths: string[] };
  groups: SlotGroup[];
  months: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(initial.mode);
  const [slotIds, setSlotIds] = React.useState(initial.slotIds);
  const [away, setAway] = React.useState(initial.away);
  const [confirmed, setConfirmed] = React.useState(initial.confirmedMonths);
  const [pending, setPending] = React.useState(false);

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    const result = await saveAvailabilityAction(token, { mode, slotIds: mode === "specific" ? slotIds : [], away, confirmMonths: mode === "ask_monthly" ? confirmed : [] }).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save. Try again.");
    toast.success("Saved — thank you");
    router.refresh();
  };

  return (
    <form onSubmit={save} className="grid gap-5">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[0.875rem] font-semibold">How should we schedule you?</legend>
        {MODES.map((m) => (
          <label
            key={m.key}
            className={cn(
              "flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border bg-card p-3.5 shadow-card transition-colors",
              mode === m.key ? "border-primary bg-accent/50" : "border-border"
            )}
          >
            <input type="radio" name="mode" value={m.key} checked={mode === m.key} onChange={() => setMode(m.key)} className="mt-1 size-4 accent-[var(--primary)]" />
            <span>
              <span className="block text-[0.9375rem] font-medium">{m.title}</span>
              <span className="block text-[0.8125rem] text-muted-foreground">{m.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {mode === "specific" ? (
        <fieldset className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
          <legend className="px-1 text-[0.875rem] font-semibold">Slots that suit you</legend>
          {groups.map((g) => (
            <div key={g.location} className="grid gap-1">
              <p className="text-[0.8125rem] font-medium text-muted-foreground">{g.location}</p>
              {g.slots.map((s) => (
                <label key={s.id} className="row-hover flex min-h-11 items-center gap-3 rounded-lg px-2 text-[0.9375rem]">
                  <input type="checkbox" checked={slotIds.includes(s.id)} onChange={() => setSlotIds(toggle(slotIds, s.id))} className="size-4 accent-[var(--primary)]" />
                  {s.label}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      ) : null}

      {mode === "ask_monthly" ? (
        <fieldset className="grid gap-1 rounded-2xl border border-border bg-card p-4 shadow-card">
          <legend className="px-1 text-[0.875rem] font-semibold">I&apos;m available in</legend>
          {months.map((m) => (
            <label key={m.key} className="row-hover flex min-h-11 items-center gap-3 rounded-lg px-2 text-[0.9375rem]">
              <input type="checkbox" checked={confirmed.includes(m.key)} onChange={() => setConfirmed(toggle(confirmed, m.key))} className="size-4 accent-[var(--primary)]" />
              {m.label}
            </label>
          ))}
        </fieldset>
      ) : null}

      <fieldset className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <legend className="px-1 text-[0.875rem] font-semibold">Dates you&apos;re away</legend>
        {away.length === 0 ? <p className="text-[0.8125rem] text-muted-foreground">None.</p> : null}
        {away.map((a, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <div className="grid gap-1">
              <Label htmlFor={`from-${i}`}>From</Label>
              <Input id={`from-${i}`} type="date" value={a.start} onChange={(e) => setAway(away.map((x, k) => (k === i ? { ...x, start: e.target.value } : x)))} />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`to-${i}`}>To</Label>
              <Input id={`to-${i}`} type="date" min={a.start} value={a.end} onChange={(e) => setAway(away.map((x, k) => (k === i ? { ...x, end: e.target.value } : x)))} />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove these dates" onClick={() => setAway(away.filter((_, k) => k !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10);
            setAway([...away, { start: today, end: today, reason: "" }]);
          }}
        >
          <Plus />
          Add dates
        </Button>
      </fieldset>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : null}
        Save
      </Button>
    </form>
  );
}
