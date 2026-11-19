"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, Copy, Link2, LoaderCircle, Plus, Trash2, X } from "lucide-react";

import { archiveMemberAction, memberLinkAction, saveMemberAction } from "@/app/(app)/members/actions";
import type { Limits, LocationOption, MemberRow } from "@/components/members/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, Textarea } from "@/components/ui/native-select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { WEEKDAY_NAMES } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { AVAILABILITY_LABELS, type MemberInput } from "@/lib/members/input";
import { monthlyLimit, PRIVILEGE_LABELS, PRIVILEGES } from "@/lib/members/limits";
import { displayPhone, normalisePhone } from "@/lib/members/phone";
import { cn } from "@/lib/utils";

type Form = Omit<MemberInput, "maxSessionsOverride"> & { maxSessionsOverride: string };

const blank = (): Form => ({
  id: null,
  title: "Sis",
  titleConfirmed: true,
  firstName: "",
  lastName: "",
  displayName: "",
  phone: "",
  privilege: "publisher",
  maxSessionsOverride: "",
  availabilityMode: "flexible",
  slotIds: [],
  preferredLocationId: null,
  notes: "",
  active: true,
  pausedUntil: null,
  partnerId: null,
  alwaysTogether: false,
  neverIds: [],
  unavailable: [],
});

const fromRow = (member: MemberRow): Form => ({
  ...member,
  phone: member.phoneE164 ? displayPhone(member.phoneE164) : "",
  maxSessionsOverride: member.maxSessionsOverride === null ? "" : String(member.maxSessionsOverride),
});

/**
 * The member editor (§10.3), in Budgeteer's adaptive sheet: up from the
 * bottom on a phone, in from the right on a laptop.
 *
 * Keyed on the member, so its fields are *initial* state for whoever opened
 * it, rather than state synced from props by an effect.
 */
export function MemberSheet(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberRow | null;
  members: MemberRow[];
  locations: LocationOption[];
  limits: Limits;
  canEdit: boolean;
}) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="sm:max-w-[30rem]">
        {props.open ? <MemberForm key={props.member?.id ?? "new"} {...props} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="font-display text-[0.9375rem] font-semibold">{title}</h3>
        {hint ? <p className="mt-0.5 text-[0.75rem] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MemberForm({ onOpenChange, member, members, locations, limits, canEdit }: Parameters<typeof MemberSheet>[0]) {
  const router = useRouter();
  const [form, setForm] = React.useState<Form>(() => (member ? fromRow(member) : blank()));
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<"save" | "archive" | "link" | null>(null);
  const [link, setLink] = React.useState<string | null>(null);
  const [hasLink, setHasLink] = React.useState(member?.hasLink ?? false);
  const [copied, setCopied] = React.useState(false);
  // The display name follows first + last until someone types their own.
  const [nameTouched, setNameTouched] = React.useState(Boolean(member));

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setName = (first: string, last: string) =>
    setForm((current) => ({ ...current, firstName: first, lastName: last, displayName: nameTouched ? current.displayName : `${first} ${last}`.trim() }));

  const phone = form.phone.trim() ? normalisePhone(form.phone) : null;
  const others = members.filter((m) => m.id !== form.id);
  const partnerOptions = others.filter((m) => m.title !== form.title && (!m.partnerId || m.partnerId === form.id));
  const limit = monthlyLimit({ privilege: form.privilege, maxSessionsOverride: form.maxSessionsOverride === "" ? null : Number(form.maxSessionsOverride) }, limits);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.displayName ?? "Someone removed";
  const readOnly = !canEdit;

  const save = async () => {
    setPending("save");
    setError(null);
    const result = await saveMemberAction({
      ...form,
      maxSessionsOverride: form.maxSessionsOverride === "" ? null : Number(form.maxSessionsOverride),
      // Slots only matter in "specific" mode; kept otherwise so switching back restores them.
      slotIds: form.slotIds,
    }).catch(() => null);
    setPending(null);
    if (!result) return setError("That didn't save. Check your connection and try again.");
    if (!result.ok) return setError(result.error);
    toast.success(member ? `${form.displayName} saved` : `${form.displayName} added`);
    onOpenChange(false);
    router.refresh();
  };

  const archive = async () => {
    if (!member) return;
    setPending("archive");
    const result = await archiveMemberAction(member.id).catch(() => null);
    setPending(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    toast.success(`${member.displayName} archived — their past sessions stay in the history`);
    onOpenChange(false);
    router.refresh();
  };

  const makeLink = async (mode: "show" | "create" | "revoke") => {
    if (!member) return;
    setPending("link");
    const result = await memberLinkAction(member.id, mode).catch(() => null);
    setPending(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    setLink(result.url);
    setHasLink(mode !== "revoke");
    setCopied(false);
    if (mode === "revoke") toast.success("Link revoked — the old one no longer works");
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied");
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{member ? member.displayName : "Add member"}</SheetTitle>
        <SheetDescription>
          {member ? `${member.month.sessions} ${member.month.sessions === 1 ? "session" : "sessions"} this month · limit ${limit}` : "Someone new for the rota."}
        </SheetDescription>
      </SheetHeader>

      <SheetBody>
        <fieldset disabled={readOnly || pending !== null} className="grid gap-5">
          <Section title="Who">
            <div className="grid grid-cols-[6.5rem_1fr] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="m-title">Title</Label>
                <NativeSelect id="m-title" value={form.title} onChange={(event) => set("title", event.target.value as Form["title"])}>
                  <option value="Bro">Bro</option>
                  <option value="Sis">Sis</option>
                </NativeSelect>
              </div>
              <label className="flex items-end justify-between gap-3 pb-2" htmlFor="m-title-confirmed">
                <span className="text-[0.8125rem]">
                  Title confirmed
                  <span className="block text-[0.6875rem] text-muted-foreground">Decides who can be paired.</span>
                </span>
                <Switch id="m-title-confirmed" checked={form.titleConfirmed} onCheckedChange={(value) => set("titleConfirmed", value)} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="m-first">First name</Label>
                <Input id="m-first" value={form.firstName} onChange={(event) => setName(event.target.value, form.lastName)} autoComplete="off" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-last">Last name</Label>
                <Input id="m-last" value={form.lastName} onChange={(event) => setName(form.firstName, event.target.value)} autoComplete="off" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-display">Name on the schedule</Label>
              <Input
                id="m-display"
                value={form.displayName}
                onChange={(event) => {
                  setNameTouched(true);
                  set("displayName", event.target.value);
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-phone">WhatsApp number</Label>
              <Input id="m-phone" type="tel" inputMode="tel" placeholder="024 123 4567" value={form.phone} onChange={(event) => set("phone", event.target.value)} />
              {phone ? (
                <p className={cn("text-[0.6875rem]", phone.ok ? "text-muted-foreground" : "text-danger-foreground")}>
                  {phone.ok ? `Saved as ${phone.e164}` : phone.error}
                </p>
              ) : null}
            </div>
          </Section>

          <Section title="Sessions a month" hint="Pioneers can be given more. A personal limit overrides the privilege's.">
            <div className="grid grid-cols-[1fr_7.5rem] gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="m-privilege">Privilege</Label>
                <NativeSelect id="m-privilege" value={form.privilege} onChange={(event) => set("privilege", event.target.value as Form["privilege"])}>
                  {PRIVILEGES.map((privilege) => (
                    <option key={privilege} value={privilege}>
                      {PRIVILEGE_LABELS[privilege]} ({limits[privilege]})
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-override">Own limit</Label>
                <Input
                  id="m-override"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={31}
                  placeholder={String(limits[form.privilege])}
                  value={form.maxSessionsOverride}
                  onChange={(event) => set("maxSessionsOverride", event.target.value)}
                  className="tabular"
                />
              </div>
            </div>
            <p className="text-[0.75rem] text-muted-foreground">
              Up to <span className="font-medium text-foreground">{limit}</span> {limit === 1 ? "session" : "sessions"} a month
              {form.maxSessionsOverride === "" ? `, from ${PRIVILEGE_LABELS[form.privilege].toLowerCase()}.` : ", their own limit."}
            </p>
          </Section>

          <Section title="When they can serve">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Availability">
              {(Object.keys(AVAILABILITY_LABELS) as Form["availabilityMode"][]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={form.availabilityMode === mode}
                  onClick={() => set("availabilityMode", mode)}
                  className={cn(
                    "min-h-9 rounded-lg px-2 text-[0.75rem] font-medium transition-[background-color,box-shadow] duration-150 pointer-coarse:min-h-11",
                    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                    form.availabilityMode === mode ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {AVAILABILITY_LABELS[mode]}
                </button>
              ))}
            </div>
            <p className="text-[0.75rem] text-muted-foreground">
              {form.availabilityMode === "specific"
                ? "Only placed in the slots ticked below."
                : form.availabilityMode === "flexible"
                  ? "Can be placed in any slot."
                  : "Never placed until they confirm a month through their link."}
            </p>
            {form.availabilityMode === "specific" ? (
              <div className="grid gap-3">
                {locations.map((location) => (
                  <div key={location.id} className="rounded-xl border border-border p-3">
                    <p className="mb-2 flex items-center gap-2 text-[0.8125rem] font-medium">
                      <span className={cn("size-2 rounded-full", location.key === "mtn" ? "bg-mtn" : "bg-police")} aria-hidden />
                      {location.name}
                    </p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {location.slots.map((slot) => {
                        const checked = form.slotIds.includes(slot.id);
                        return (
                          <label key={slot.id} className="row-hover flex min-h-10 items-center gap-2.5 rounded-lg px-2 text-[0.8125rem] pointer-coarse:min-h-11">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => set("slotIds", checked ? form.slotIds.filter((id) => id !== slot.id) : [...form.slotIds, slot.id])}
                              className="size-4 accent-[var(--primary)]"
                            />
                            <span>
                              <span className="font-medium">{WEEKDAY_NAMES[slot.weekday].slice(0, 3)}</span> {formatTimeRange(slot.startTime, slot.endTime)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label htmlFor="m-location">Preferred location</Label>
              <NativeSelect id="m-location" value={form.preferredLocationId ?? ""} onChange={(event) => set("preferredLocationId", event.target.value || null)}>
                <option value="">No preference</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </Section>

          <Section title="Away dates" hint="Never booked on these days.">
            {form.unavailable.map((range, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`away-from-${index}`}>From</Label>
                  <Input id={`away-from-${index}`} type="date" value={range.start} onChange={(event) => set("unavailable", form.unavailable.map((r, i) => (i === index ? { ...r, start: event.target.value, end: r.end < event.target.value ? event.target.value : r.end } : r)))} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`away-to-${index}`}>To</Label>
                  <Input id={`away-to-${index}`} type="date" value={range.end} min={range.start} onChange={(event) => set("unavailable", form.unavailable.map((r, i) => (i === index ? { ...r, end: event.target.value } : r)))} />
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove these dates" onClick={() => set("unavailable", form.unavailable.filter((_, i) => i !== index))}>
                  <Trash2 />
                </Button>
                <Input
                  className="col-span-3"
                  placeholder="Reason (optional)"
                  aria-label="Reason"
                  value={range.reason}
                  onChange={(event) => set("unavailable", form.unavailable.map((r, i) => (i === index ? { ...r, reason: event.target.value } : r)))}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                set("unavailable", [...form.unavailable, { start: today, end: today, reason: "" }]);
              }}
            >
              <Plus />
              Add away dates
            </Button>
          </Section>

          <Section title="Partners" hint="A couple usually serves together, and can also serve in a Bro or Sis pair unless you keep them together. Anyone on the never list is never paired with them.">
            <div className="grid gap-1.5">
              <Label htmlFor="m-partner">Husband or wife</Label>
              <NativeSelect id="m-partner" value={form.partnerId ?? ""} onChange={(event) => set("partnerId", event.target.value || null)}>
                <option value="">Not in a couple</option>
                {partnerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} {m.displayName}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {form.partnerId ? (
              <label className="flex items-start justify-between gap-3" htmlFor="m-together">
                <span>
                  <span className="block text-[0.875rem] font-medium">Always together</span>
                  <span className="block text-[0.75rem] text-muted-foreground">Only ever place them with each other, never in a separate Bro or Sis pair.</span>
                </span>
                <Switch id="m-together" checked={form.alwaysTogether} onCheckedChange={(value) => set("alwaysTogether", value)} />
              </label>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="m-never">Never pair with</Label>
              {form.neverIds.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {form.neverIds.map((id) => (
                    <Badge key={id} variant="outline" className="pr-1">
                      {nameOf(id)}
                      <button type="button" aria-label={`Remove ${nameOf(id)}`} onClick={() => set("neverIds", form.neverIds.filter((other) => other !== id))} className="rounded-full p-0.5 hover:bg-muted">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
              <NativeSelect
                id="m-never"
                value=""
                onChange={(event) => event.target.value && set("neverIds", [...form.neverIds, event.target.value])}
              >
                <option value="">Add someone…</option>
                {others
                  .filter((m) => !form.neverIds.includes(m.id) && m.id !== form.partnerId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} {m.displayName}
                    </option>
                  ))}
              </NativeSelect>
            </div>
          </Section>

          <Section title="Status">
            <label className="flex items-center justify-between gap-3" htmlFor="m-active">
              <span className="text-[0.8125rem]">
                Active
                <span className="block text-[0.6875rem] text-muted-foreground">Inactive people are never scheduled.</span>
              </span>
              <Switch id="m-active" checked={form.active} onCheckedChange={(value) => set("active", value)} />
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="m-paused">Paused until</Label>
              <div className="flex gap-2">
                <Input id="m-paused" type="date" value={form.pausedUntil ?? ""} onChange={(event) => set("pausedUntil", event.target.value || null)} />
                {form.pausedUntil ? (
                  <Button type="button" variant="ghost" onClick={() => set("pausedUntil", null)}>
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="m-notes">Notes</Label>
              <Textarea id="m-notes" value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Only you and your editors see these." />
            </div>
          </Section>

          {member ? (
            <Section title="Private link" hint="Their own page: upcoming sessions, availability, and confirming or declining. No sign-in.">
              {link ? (
                <div className="grid gap-2">
                  <div className="flex gap-2">
                    <Input readOnly value={link} aria-label="Private link" onFocus={(event) => event.target.select()} className="font-mono text-[0.75rem]" />
                    <Button type="button" variant="outline" onClick={() => void copy()} aria-label="Copy link">
                      {copied ? <Check /> : <Copy />}
                    </Button>
                  </div>
                  <p className="text-[0.6875rem] text-muted-foreground">Only for them: it shows their sessions and lets them set their availability. Making a new one stops this one working.</p>
                </div>
              ) : (
                <p className="text-[0.8125rem] text-muted-foreground">{hasLink ? "They have a link." : "No link yet."}</p>
              )}
              <div className="flex flex-wrap gap-2">
                {hasLink && !link ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => void makeLink("show")}>
                    <Link2 />
                    Show link
                  </Button>
                ) : null}
                <Button type="button" variant={hasLink ? "ghost" : "outline"} size="sm" onClick={() => void makeLink("create")}>
                  {pending === "link" ? <LoaderCircle className="animate-spin" /> : <Link2 />}
                  {hasLink ? "Make a new link" : "Make link"}
                </Button>
                {hasLink ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void makeLink("revoke")}>
                    Revoke
                  </Button>
                ) : null}
              </div>
            </Section>
          ) : null}
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
            {member ? (
              <Button type="button" variant="ghost" onClick={() => void archive()} disabled={pending !== null} aria-label="Archive member">
                {pending === "archive" ? <LoaderCircle className="animate-spin" /> : <Archive />}
                <span className="hidden sm:inline">Archive</span>
              </Button>
            ) : null}
            <Button type="button" className="flex-1" onClick={() => void save()} disabled={pending !== null}>
              {pending === "save" ? <LoaderCircle className="animate-spin" /> : null}
              {pending === "save" ? "Saving…" : member ? "Save changes" : "Add member"}
            </Button>
          </div>
        </SheetFooter>
      ) : null}
    </>
  );
}
