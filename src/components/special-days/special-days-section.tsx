"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarOff, LoaderCircle, Plus, Repeat, Trash2 } from "lucide-react";

import { deleteSpecialDayAction, saveSpecialDayAction, setSpecialDayActiveAction } from "@/app/(app)/locations/special-day-actions";
import { RulePreview, type PreviewLocation } from "@/components/special-days/rule-preview";
import { whatLabel, whenLabel } from "@/components/special-days/describe";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, Textarea } from "@/components/ui/native-select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { WEEKDAY_NAMES, WEEKDAYS, type Weekday } from "@/lib/dates/calendar";
import type { MonthSettings } from "@/lib/dates/sessions";
import type { SpecialDayInput } from "@/lib/dates/special-day-input";
import { ACTION_LABELS, type SpecialDayAction, type SpecialDayRule } from "@/lib/dates/special-days";
import { formatTimeRange } from "@/lib/dates/time";
import { cn } from "@/lib/utils";

const RECURRING_ACTIONS: SpecialDayAction[] = ["off_before_cutoff_shift_overlap", "shift_all_to_cutoff", "cancel_matching_slots"];
const ONE_OFF_ACTIONS: SpecialDayAction[] = ["cancel", "change_time", "add_session"];
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

const toForm = (rule: SpecialDayRule | null, today: string): SpecialDayInput =>
  rule
    ? {
        id: rule.id,
        name: rule.name,
        kind: rule.kind,
        recurrenceN: rule.recurrence?.n ?? 1,
        recurrenceWeekday: rule.recurrence?.weekday ?? "SAT",
        date: rule.date,
        endDate: rule.endDate,
        locationIds: rule.locationIds ?? [],
        slotIds: rule.slotIds ?? [],
        action: rule.action,
        cutoffTime: rule.cutoffTime,
        newStartTime: rule.newStartTime,
        newEndTime: rule.newEndTime,
        noteForMessages: rule.noteForMessages ?? "",
        noteForPdf: rule.noteForPdf ?? "",
        active: rule.active,
      }
    : {
        id: null,
        name: "",
        kind: "one_off",
        recurrenceN: 1,
        recurrenceWeekday: "SAT",
        date: today,
        endDate: null,
        locationIds: [],
        slotIds: [],
        action: "cancel",
        cutoffTime: null,
        newStartTime: "16:00",
        newEndTime: "18:00",
        noteForMessages: "",
        noteForPdf: "",
        active: true,
      };

const toRule = (form: SpecialDayInput): SpecialDayRule => ({
  id: form.id ?? "preview",
  name: form.name || "This day",
  kind: form.kind,
  recurrence: form.kind === "recurring" ? { type: "nth_weekday", n: form.recurrenceN, weekday: form.recurrenceWeekday } : null,
  date: form.kind === "one_off" ? form.date : null,
  endDate: form.kind === "one_off" ? form.endDate : null,
  locationIds: form.locationIds.length > 0 ? form.locationIds : null,
  slotIds: form.slotIds.length > 0 ? form.slotIds : null,
  action: form.action,
  cutoffTime: form.cutoffTime,
  newStartTime: form.newStartTime,
  newEndTime: form.newEndTime,
  noteForMessages: form.noteForMessages,
  noteForPdf: form.noteForPdf,
  active: form.active,
});

/**
 * Special days (§7), at the bottom of Locations: a card per rule saying when
 * it applies and what it does in plain words, a switch to turn it off without
 * losing it, and an editor with the live preview beside the fields.
 */
export function SpecialDaysSection({
  rules,
  locations,
  settings,
  today,
  canEdit,
}: {
  rules: SpecialDayRule[];
  locations: PreviewLocation[];
  settings: MonthSettings;
  today: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<SpecialDayRule | "new" | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const nameOf = new Map(locations.map((l) => [l.id, l.name]));

  const toggle = async (rule: SpecialDayRule, active: boolean) => {
    setBusy(rule.id);
    const result = await setSpecialDayActiveAction(rule.id, active).catch(() => null);
    setBusy(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save.");
    toast.success(active ? `${rule.name} is on` : `${rule.name} is off — schedules ignore it until it's back on`);
    router.refresh();
  };

  return (
    <section className="rise grid gap-3 [animation-delay:120ms]" aria-labelledby="special-days">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="special-days" className="font-display text-lg font-semibold tracking-tight">
            Special days
          </h2>
          <p className="text-[0.8125rem] text-muted-foreground">Days that turn slots off or move their times. The schedule, the sheet and the messages all follow them.</p>
        </div>
        {canEdit ? (
          <Button variant="outline" onClick={() => setEditing("new")}>
            <Plus />
            Add special day
          </Button>
        ) : null}
      </div>

      {rules.length === 0 ? (
        <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-4">
          <CalendarOff className="mt-0.5 size-4 text-muted-foreground" />
          <p className="text-[0.8125rem] text-muted-foreground">No special days yet. Running the seed adds National Sanitation Day.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rules.map((rule) => (
            <li key={rule.id} className={cn("rounded-2xl border border-border bg-card shadow-card transition-opacity", !rule.active && "opacity-60")}>
              <button
                type="button"
                onClick={() => setEditing(rule)}
                className="lift grid w-full gap-1.5 rounded-t-2xl p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <span className="flex flex-wrap items-center gap-2">
                  {rule.kind === "recurring" ? <Repeat className="size-4 text-muted-foreground" /> : <CalendarOff className="size-4 text-muted-foreground" />}
                  <span className="text-[0.9375rem] font-semibold">{rule.name}</span>
                  {!rule.active ? <Badge variant="secondary" size="sm">Off</Badge> : null}
                </span>
                <span className="text-[0.8125rem]">{whenLabel(rule)}</span>
                <span className="text-[0.8125rem] text-muted-foreground">{whatLabel(rule)}</span>
                <span className="text-[0.75rem] text-muted-foreground">
                  {rule.locationIds?.length ? rule.locationIds.map((id) => nameOf.get(id) ?? "A removed location").join(", ") : "All locations"}
                </span>
              </button>
              <div className="flex items-center justify-between border-t border-border/70 px-4 py-2.5">
                <label className="flex items-center gap-2 text-[0.8125rem]" htmlFor={`rule-${rule.id}`}>
                  In use
                  <Switch id={`rule-${rule.id}`} checked={rule.active} disabled={!canEdit || busy === rule.id} onCheckedChange={(value) => void toggle(rule, value)} />
                </label>
                <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                  {canEdit ? "Edit" : "View"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <SheetContent className="sm:max-w-[32rem]">
          {editing !== null ? (
            <RuleForm
              key={editing === "new" ? "new" : editing.id}
              rule={editing === "new" ? null : editing}
              locations={locations}
              settings={settings}
              today={today}
              canEdit={canEdit}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function RuleForm({
  rule,
  locations,
  settings,
  today,
  canEdit,
  onDone,
}: {
  rule: SpecialDayRule | null;
  locations: PreviewLocation[];
  settings: MonthSettings;
  today: string;
  canEdit: boolean;
  onDone: () => void;
}) {
  const [form, setForm] = React.useState(() => toForm(rule, today));
  const [pending, setPending] = React.useState<"save" | "delete" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const set = <K extends keyof SpecialDayInput>(key: K, value: SpecialDayInput[K]) => setForm((current) => ({ ...current, [key]: value }));

  const switchKind = (kind: SpecialDayInput["kind"]) =>
    setForm((current) => ({
      ...current,
      kind,
      action: kind === "recurring" ? "off_before_cutoff_shift_overlap" : "cancel",
      cutoffTime: kind === "recurring" ? (current.cutoffTime ?? "10:00") : current.cutoffTime,
      date: kind === "one_off" ? (current.date ?? today) : current.date,
    }));

  const shownLocations = form.locationIds.length > 0 ? locations.filter((l) => form.locationIds.includes(l.id)) : locations;
  const pickable = form.kind === "one_off" && (form.action === "cancel" || form.action === "change_time");

  const save = async () => {
    setPending("save");
    setError(null);
    const result = await saveSpecialDayAction(form).catch(() => null);
    setPending(null);
    if (!result) return setError("That didn't save. Check your connection and try again.");
    if (!result.ok) return setError(result.error);
    toast.success(`${form.name} saved`);
    onDone();
  };

  const remove = async () => {
    if (!rule) return;
    setPending("delete");
    const result = await deleteSpecialDayAction(rule.id).catch(() => null);
    setPending(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    toast.success(`${rule.name} deleted`);
    onDone();
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{rule ? rule.name : "New special day"}</SheetTitle>
        <SheetDescription>Turns slots off or moves them. The preview shows exactly what changes.</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <fieldset disabled={!canEdit || pending !== null} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sd-name">Name</Label>
            <Input id="sd-name" value={form.name} onChange={(event) => set("name", event.target.value)} placeholder="Circuit assembly" />
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="How often">
            {(["one_off", "recurring"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={form.kind === kind}
                onClick={() => switchKind(kind)}
                className={cn(
                  "min-h-9 rounded-lg text-[0.8125rem] font-medium transition-[background-color,box-shadow] duration-150 pointer-coarse:min-h-11",
                  "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  form.kind === kind ? "bg-card shadow-card" : "text-muted-foreground"
                )}
              >
                {kind === "one_off" ? "One date or weekend" : "Every month"}
              </button>
            ))}
          </div>

          {form.kind === "recurring" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sd-n">Which</Label>
                <NativeSelect id="sd-n" value={form.recurrenceN} onChange={(event) => set("recurrenceN", Number(event.target.value))}>
                  {ORDINALS.map((label, i) => (
                    <option key={label} value={i + 1}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sd-weekday">Day</Label>
                <NativeSelect id="sd-weekday" value={form.recurrenceWeekday} onChange={(event) => set("recurrenceWeekday", event.target.value as Weekday)}>
                  {WEEKDAYS.map((day) => (
                    <option key={day} value={day}>
                      {WEEKDAY_NAMES[day]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sd-date">From</Label>
                <Input id="sd-date" type="date" value={form.date ?? ""} onChange={(event) => set("date", event.target.value || null)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sd-end">To (optional)</Label>
                <Input id="sd-end" type="date" min={form.date ?? undefined} value={form.endDate ?? ""} onChange={(event) => set("endDate", event.target.value || null)} />
              </div>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="sd-action">What happens</Label>
            <NativeSelect id="sd-action" value={form.action} onChange={(event) => set("action", event.target.value as SpecialDayAction)}>
              {(form.kind === "recurring" ? RECURRING_ACTIONS : ONE_OFF_ACTIONS).map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action]}
                </option>
              ))}
            </NativeSelect>
          </div>

          {form.kind === "recurring" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="sd-cutoff">{form.action === "cancel_matching_slots" ? "Cutoff (optional)" : "It ends at"}</Label>
              <div className="flex gap-2">
                <Input id="sd-cutoff" type="time" step={300} value={form.cutoffTime ?? ""} onChange={(event) => set("cutoffTime", event.target.value || null)} className="w-40" />
                {form.action === "cancel_matching_slots" && form.cutoffTime ? (
                  <Button type="button" variant="ghost" onClick={() => set("cutoffTime", null)}>
                    Whole day
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {form.kind === "one_off" && (form.action === "change_time" || form.action === "add_session") ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sd-start">{form.action === "add_session" ? "Starts" : "New start"}</Label>
                <Input id="sd-start" type="time" step={300} value={form.newStartTime ?? ""} onChange={(event) => set("newStartTime", event.target.value || null)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sd-finish">{form.action === "add_session" ? "Ends" : "New end"}</Label>
                <Input id="sd-finish" type="time" step={300} value={form.newEndTime ?? ""} onChange={(event) => set("newEndTime", event.target.value || null)} />
              </div>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label>{form.action === "add_session" ? "Where" : "Locations"}</Label>
            <div className="flex flex-wrap gap-1.5">
              {form.action !== "add_session" ? (
                <Chip on={form.locationIds.length === 0} onClick={() => setForm({ ...form, locationIds: [], slotIds: [] })}>
                  All locations
                </Chip>
              ) : null}
              {locations.map((location) => {
                const on = form.locationIds.includes(location.id);
                return (
                  <Chip
                    key={location.id}
                    on={on}
                    onClick={() =>
                      setForm({
                        ...form,
                        locationIds: on ? form.locationIds.filter((id) => id !== location.id) : [...form.locationIds, location.id],
                        slotIds: on ? form.slotIds.filter((id) => !location.slots.some((s) => s.id === id)) : form.slotIds,
                      })
                    }
                  >
                    {location.name}
                  </Chip>
                );
              })}
            </div>
          </div>

          {pickable ? (
            <div className="grid gap-2">
              <Label>Slots</Label>
              <p className="-mt-1 text-[0.75rem] text-muted-foreground">Leave them all unticked to include every slot.</p>
              {shownLocations.map((location) => (
                <div key={location.id} className="grid gap-1">
                  <p className="text-[0.75rem] font-medium text-muted-foreground">{location.name}</p>
                  <div className="grid grid-cols-1 gap-x-2 min-[420px]:grid-cols-2">
                    {location.slots
                      .filter((s) => s.active)
                      .map((slot) => {
                        const checked = form.slotIds.includes(slot.id);
                        return (
                          <label key={slot.id} className="row-hover flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-[0.8125rem] pointer-coarse:min-h-11">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => set("slotIds", checked ? form.slotIds.filter((id) => id !== slot.id) : [...form.slotIds, slot.id])}
                              className="size-4 shrink-0 accent-[var(--primary)]"
                            />
                            <span className="tabular whitespace-nowrap">
                              {WEEKDAY_NAMES[slot.weekday].slice(0, 3)} · {formatTimeRange(slot.startTime, slot.endTime)}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <RulePreview rule={toRule(form)} locations={locations} settings={settings} today={today} />

          <div className="grid gap-1.5">
            <Label htmlFor="sd-msg">Note in messages</Label>
            <Textarea id="sd-msg" value={form.noteForMessages} onChange={(event) => set("noteForMessages", event.target.value)} placeholder="Added under the weekend message when this day is in it." className="min-h-16" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sd-pdf">Note on the sheet</Label>
            <Input id="sd-pdf" value={form.noteForPdf} onChange={(event) => set("noteForPdf", event.target.value)} placeholder="The footnote under the printed table." />
          </div>
          <label className="flex items-center justify-between gap-3 text-[0.8125rem]" htmlFor="sd-active">
            In use
            <Switch id="sd-active" checked={form.active} onCheckedChange={(value) => set("active", value)} />
          </label>
        </fieldset>
      </SheetBody>
      {canEdit ? (
        <SheetFooter className="grid gap-2">
          {error ? (
            <p role="alert" className="rounded-xl border border-danger-border bg-danger px-3 py-2 text-[0.8125rem] text-danger-foreground">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            {rule ? (
              <Button type="button" variant="ghost" onClick={() => void remove()} disabled={pending !== null} aria-label="Delete special day">
                {pending === "delete" ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
                <span className="hidden sm:inline">Delete</span>
              </Button>
            ) : null}
            <Button type="button" className="flex-1" onClick={() => void save()} disabled={pending !== null}>
              {pending === "save" ? <LoaderCircle className="animate-spin" /> : null}
              {rule ? "Save changes" : "Add special day"}
            </Button>
          </div>
        </SheetFooter>
      ) : null}
    </>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors duration-150 pointer-coarse:min-h-11",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        on ? "border-inverted bg-inverted text-inverted-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
