"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, MapPin, Plus, RotateCcw, Trash2 } from "lucide-react";

import { saveLocationAction } from "@/app/(app)/locations/actions";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { WEEKDAY_NAMES, WEEKDAYS, type Weekday } from "@/lib/dates/calendar";
import { formatTimeRange, minutesOf } from "@/lib/dates/time";
import type { LocationInput } from "@/lib/locations/input";
import { cn } from "@/lib/utils";

type LocationForm = LocationInput & { key: string | null };

/**
 * Locations & slots (§10.5): one card per location, each with an editable
 * slot table. Changes are held in the card until Save, with a Reset beside it
 * — editing a rota's times is the kind of change worth looking at before it
 * lands. The time label for the sheet is filled in from the times unless it
 * has been typed, because a mistyped "pm" is how the old sheets went wrong.
 */
export function LocationsView({ locations, canEdit, children }: { locations: LocationForm[]; canEdit: boolean; children?: React.ReactNode }) {
  const [adding, setAdding] = React.useState(false);

  return (
    <>
      <PageHeader
        title="Locations & slots"
        description="Where witnessing happens, and the weekly times at each place. Every slot needs two people."
        action={
          canEdit && !adding ? (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus />
              Add location
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4">
        {locations.length === 0 && !adding ? (
          <EmptyState icon={MapPin} title="No locations yet" hint="Run `pnpm db:seed` to bring in the Police Station and MTN office with their slots, or add one." className="bg-card" />
        ) : null}

        {locations.map((location, index) => (
          <LocationCard key={location.id} initial={location} canEdit={canEdit} delay={index * 50} />
        ))}

        {adding ? (
          <LocationCard
            initial={{ id: null, key: null, name: "", messageName: "", pdfTitle: "", pdfColor: "#B4E0A3", active: true, slots: [] }}
            canEdit={canEdit}
            delay={0}
            onDone={() => setAdding(false)}
          />
        ) : null}

        {children}
      </div>
    </>
  );
}

function LocationCard({ initial, canEdit, delay, onDone }: { initial: LocationForm; canEdit: boolean; delay: number; onDone?: () => void }) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Which slots' sheet labels were typed rather than derived.
  const [typedLabel, setTypedLabel] = React.useState<Set<number>>(new Set());

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  // Sheet labels that don't say what the times say — "6:00pm", "9:30 – 11:30AM".
  const untidy = form.slots.filter((slot) => minutesOf(slot.endTime) > minutesOf(slot.startTime) && slot.pdfTimeLabel !== formatTimeRange(slot.startTime, slot.endTime)).length;
  const accent = form.key === "mtn" ? "bg-mtn" : form.key === "police" ? "bg-police" : "bg-primary";

  const setSlot = (index: number, patch: Partial<LocationForm["slots"][number]>) =>
    setForm((current) => ({
      ...current,
      slots: current.slots.map((slot, i) => {
        if (i !== index) return slot;
        const next = { ...slot, ...patch };
        if (!typedLabel.has(index) && (patch.startTime || patch.endTime) && minutesOf(next.endTime) > minutesOf(next.startTime)) {
          next.pdfTimeLabel = formatTimeRange(next.startTime, next.endTime);
        }
        if (patch.weekday && !typedLabel.has(-index - 1)) next.pdfDayLabel = WEEKDAY_NAMES[patch.weekday].toUpperCase();
        return next;
      }),
    }));

  const addSlot = () =>
    setForm((current) => {
      const last = current.slots.at(-1);
      const weekday: Weekday = last?.weekday ?? "SAT";
      return {
        ...current,
        slots: [...current.slots, { id: null, weekday, startTime: "06:00", endTime: "08:00", pdfDayLabel: WEEKDAY_NAMES[weekday].toUpperCase(), pdfTimeLabel: formatTimeRange("06:00", "08:00"), active: true }],
      };
    });

  const save = async () => {
    setPending(true);
    setError(null);
    const { key: _key, ...input } = form;
    void _key;
    const result = await saveLocationAction(input).catch(() => null);
    setPending(false);
    if (!result) return setError("That didn't save. Check your connection and try again.");
    if (!result.ok) return setError(result.error);
    toast.success(`${form.name} saved`);
    onDone?.();
    router.refresh();
  };

  return (
    <section className="rise overflow-hidden rounded-2xl border border-border bg-card shadow-card" style={{ animationDelay: `${delay}ms` }}>
      {/* The same colour bar the printed sheet uses, so the card and the PDF read as the same place. */}
      <div className="h-1.5" style={{ backgroundColor: form.pdfColor }} aria-hidden />
      <fieldset disabled={!canEdit || pending} className="grid gap-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className={cn("size-2.5 rounded-full", accent)} aria-hidden />
            <h2 className="font-display text-lg font-semibold tracking-tight">{form.name || "New location"}</h2>
            {!form.active ? <Badge variant="secondary">Off</Badge> : null}
          </div>
          <label className="flex items-center gap-2 text-[0.8125rem]" htmlFor={`active-${form.id ?? "new"}`}>
            In use
            <Switch id={`active-${form.id ?? "new"}`} checked={form.active} onCheckedChange={(value) => setForm({ ...form, active: value })} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`name-${form.id}`}>Name</Label>
            <Input id={`name-${form.id}`} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Police Station – Westlands" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`msg-${form.id}`}>Name in messages</Label>
            <Input id={`msg-${form.id}`} value={form.messageName} onChange={(event) => setForm({ ...form, messageName: event.target.value })} placeholder="Used in “at the location near the …”" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`pdf-${form.id}`}>Title on the sheet</Label>
            <Input id={`pdf-${form.id}`} value={form.pdfTitle} onChange={(event) => setForm({ ...form, pdfTitle: event.target.value })} placeholder="POLICE STATION - (Tuesday, Friday…)" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`color-${form.id}`}>Sheet colour</Label>
            <div className="flex gap-2">
              <input
                id={`color-${form.id}`}
                type="color"
                value={form.pdfColor}
                onChange={(event) => setForm({ ...form, pdfColor: event.target.value.toUpperCase() })}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1 pointer-coarse:h-11"
              />
              <Input value={form.pdfColor} onChange={(event) => setForm({ ...form, pdfColor: event.target.value })} aria-label="Sheet colour code" className="font-mono" />
            </div>
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[0.875rem] font-semibold">Weekly slots</h3>
            <span className="tabular text-[0.75rem] text-muted-foreground">{form.slots.filter((s) => s.active).length} in use</span>
          </div>
          <div className="hidden grid-cols-[8.5rem_6.5rem_6.5rem_1fr_1fr_3rem_2.5rem] gap-2 px-1 text-[0.6875rem] font-medium text-muted-foreground lg:grid">
            <span>Day</span>
            <span>Starts</span>
            <span>Ends</span>
            <span>Day on the sheet</span>
            <span>Time on the sheet</span>
            <span>In use</span>
            <span className="sr-only">Remove</span>
          </div>
          <ul className="grid gap-2">
            {form.slots.map((slot, index) => {
              const bad = minutesOf(slot.endTime) <= minutesOf(slot.startTime);
              return (
                <li key={slot.id ?? `new-${index}`} className={cn("grid grid-cols-2 gap-2 rounded-xl border border-border p-2.5 lg:grid-cols-[8.5rem_8.5rem_8.5rem_1fr_1fr_3rem_2.5rem] lg:items-center lg:border-0 lg:p-0", !slot.active && "opacity-55")}>
                  <NativeSelect aria-label="Day" value={slot.weekday} onChange={(event) => setSlot(index, { weekday: event.target.value as Weekday })} className="col-span-2 lg:col-span-1">
                    {WEEKDAYS.map((day) => (
                      <option key={day} value={day}>
                        {WEEKDAY_NAMES[day]}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input aria-label="Starts" type="time" step={300} value={slot.startTime} onChange={(event) => setSlot(index, { startTime: event.target.value })} />
                  <Input aria-label="Ends" type="time" step={300} value={slot.endTime} aria-invalid={bad} onChange={(event) => setSlot(index, { endTime: event.target.value })} />
                  <Input
                    aria-label="Day on the sheet"
                    value={slot.pdfDayLabel}
                    onChange={(event) => {
                      setTypedLabel((current) => new Set(current).add(-index - 1));
                      setSlot(index, { pdfDayLabel: event.target.value });
                    }}
                  />
                  <Input
                    aria-label="Time on the sheet"
                    value={slot.pdfTimeLabel}
                    onChange={(event) => {
                      setTypedLabel((current) => new Set(current).add(index));
                      setSlot(index, { pdfTimeLabel: event.target.value });
                    }}
                  />
                  <span className="flex items-center gap-2 lg:justify-center">
                    <Switch aria-label="In use" checked={slot.active} onCheckedChange={(value) => setSlot(index, { active: value })} />
                    <span className="text-[0.75rem] text-muted-foreground lg:hidden">In use</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove slot"
                    className="justify-self-end"
                    onClick={() => setForm({ ...form, slots: form.slots.filter((_, i) => i !== index) })}
                  >
                    <Trash2 />
                  </Button>
                  {bad ? <p className="col-span-2 text-[0.75rem] text-danger-foreground lg:col-span-7">A slot has to end after it starts.</p> : null}
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={addSlot}>
            <Plus />
            Add slot
          </Button>
          <p className="text-[0.6875rem] text-muted-foreground">A slot that has sessions is switched off rather than deleted, so its history stays.</p>
          {untidy > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-border bg-warning px-3 py-2.5 text-[0.8125rem] text-warning-foreground">
              <span className="min-w-0 flex-1">
                {untidy} {untidy === 1 ? "time label doesn't" : "time labels don't"} match {untidy === 1 ? "its" : "their"} times exactly — the am/pm or spacing differs.
              </span>
              <Button
                type="button"
                size="sm"
                variant="bordered"
                onClick={() => setForm({ ...form, slots: form.slots.map((slot) => (minutesOf(slot.endTime) > minutesOf(slot.startTime) ? { ...slot, pdfTimeLabel: formatTimeRange(slot.startTime, slot.endTime) } : slot)) })}
              >
                Tidy labels
              </Button>
            </div>
          ) : null}
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-background/60 px-4 py-3 sm:px-5">
          {error ? (
            <p role="alert" className="mr-auto text-[0.8125rem] text-danger-foreground">
              {error}
            </p>
          ) : dirty ? (
            <p className="mr-auto text-[0.8125rem] text-muted-foreground">Unsaved changes</p>
          ) : null}
          {initial.id ? (
            <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={() => (setForm(initial), setError(null))}>
              <RotateCcw />
              Reset
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          )}
          <Button type="button" disabled={!dirty || pending} onClick={() => void save()}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            {initial.id ? "Save" : "Add location"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
