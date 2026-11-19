"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Lock } from "lucide-react";

import { saveSettingsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { WeekRule } from "@/lib/dates/weeks";
import { cn } from "@/lib/utils";

export interface WeekRuleExample {
  rule: WeekRule;
  title: string;
  explain: string;
  /** "Week 1 · 2 – 8 Nov". */
  example: string;
  weeks: number;
}

export interface SettingsForm {
  congregationName: string;
  weekRule: WeekRule;
  includeFifthWeek: boolean;
  repeatWindowMonths: number;
}

/**
 * Settings (§10.9) for the rota itself. The week rule is the setting that
 * changes every date in a month, so each choice shows what Week 1 is this
 * month under it rather than describing it in the abstract.
 */
export function SettingsView({
  initial,
  examples,
  monthName,
  limits,
  canEdit,
}: {
  initial: SettingsForm;
  examples: WeekRuleExample[];
  monthName: string;
  limits: { label: string; value: number }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const chosen = examples.find((e) => e.rule === form.weekRule);
  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await saveSettingsAction(form).catch(() => null);
    setPending(false);
    if (!result) return setError("That didn't save. Check your connection and try again.");
    if (!result.ok) return setError(result.error);
    toast.success("Settings saved");
    router.refresh();
  };

  return (
    <form onSubmit={save} className="grid grid-cols-1 gap-4">
      {!canEdit ? (
        <p className="rise flex items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-[0.8125rem] text-muted-foreground">
          <Lock className="size-3.5" />
          Only the owner can change settings.
        </p>
      ) : null}

      <fieldset disabled={!canEdit || pending} className="grid min-w-0 grid-cols-1 gap-4">
        <Section title="Congregation" delay={0}>
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="congregation">Name</Label>
            <Input id="congregation" value={form.congregationName} onChange={(event) => set("congregationName", event.target.value)} />
            <p className="text-[0.75rem] text-muted-foreground">Printed on the sheet and used in messages.</p>
          </div>
        </Section>

        <Section title="Weeks" hint={`How a month is split into Week 1, Week 2… Shown for ${monthName}.`} delay={50}>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Week rule">
            {examples.map((example) => {
              const on = form.weekRule === example.rule;
              return (
                <button
                  key={example.rule}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set("weekRule", example.rule)}
                  className={cn(
                    "grid gap-1 rounded-xl border p-3.5 text-left transition-[border-color,background-color,box-shadow] duration-150",
                    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed",
                    on ? "border-primary bg-accent/60 shadow-card" : "border-border bg-background/60 hover:border-foreground/25"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("flex size-4 items-center justify-center rounded-full border", on ? "border-primary" : "border-border")} aria-hidden>
                      {on ? <span className="size-2 rounded-full bg-primary" /> : null}
                    </span>
                    <span className="text-[0.875rem] font-semibold">{example.title}</span>
                  </span>
                  <span className="text-[0.8125rem] text-muted-foreground">{example.explain}</span>
                  <span className="tabular mt-1 text-[0.8125rem] font-medium">{example.example}</span>
                </button>
              );
            })}
          </div>

          <label className="mt-4 flex items-start justify-between gap-4" htmlFor="fifth-week">
            <span>
              <span className="block text-[0.875rem] font-medium">Schedule a 5th week</span>
              <span className="block text-[0.8125rem] text-muted-foreground">
                {chosen && chosen.weeks === 5
                  ? `${monthName} has a 5th week under this rule${form.includeFifthWeek ? ", and it gets sessions." : ", and it would be left empty."}`
                  : `${monthName} has ${chosen?.weeks ?? 4} weeks under this rule, so this changes nothing this month.`}
              </span>
            </span>
            <Switch id="fifth-week" checked={form.includeFifthWeek} onCheckedChange={(value) => set("includeFifthWeek", value)} />
          </label>
        </Section>

        <Section title="Pairing" hint="Two people per session: two Bros, two Sis, or a married couple." delay={100}>
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="repeat">Avoid repeating a pair for</Label>
            <div className="flex items-center gap-2">
              <Input
                id="repeat"
                type="number"
                inputMode="numeric"
                min={0}
                max={12}
                value={form.repeatWindowMonths}
                onChange={(event) => set("repeatWindowMonths", Math.max(0, Math.min(12, Math.trunc(Number(event.target.value) || 0))))}
                className="w-24"
              />
              <span className="text-[0.8125rem] text-muted-foreground">{form.repeatWindowMonths === 1 ? "month" : "months"}</span>
            </div>
            <p className="text-[0.75rem] text-muted-foreground">
              {form.repeatWindowMonths === 0 ? "Pairs can repeat freely." : "The builder prefers people who haven't served together in that time. It's a preference, not a rule."}
            </p>
          </div>
        </Section>
      </fieldset>

      <Section title="Monthly limits" hint="How many sessions each person can be given in a month." delay={150}>
        <dl className="grid grid-cols-3 gap-2">
          {limits.map((limit) => (
            <div key={limit.label} className="rounded-xl bg-muted/70 px-3 py-2.5">
              <dt className="text-[0.75rem] text-muted-foreground">{limit.label}</dt>
              <dd className="tabular font-display text-lg font-semibold">{limit.value}</dd>
            </div>
          ))}
        </dl>
        <Link href="/members" className="mt-3 inline-block text-[0.8125rem] font-medium text-primary underline-offset-4 hover:underline">
          Change them in Members
        </Link>
      </Section>

      {canEdit && (dirty || error) ? (
        <div className="rise sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 md:bottom-4 flex flex-wrap items-center justify-end gap-2">
          {error ? (
            <p role="alert" className="grow rounded-xl border border-danger-border bg-danger px-3 py-2 text-[0.8125rem] text-danger-foreground">
              {error}
            </p>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => setForm(initial)} disabled={pending} className="bg-card shadow-card">
            Reset
          </Button>
          <Button type="submit" disabled={!dirty || pending} className="shadow-card">
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Save settings
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function Section({ title, hint, delay, children }: { title: string; hint?: string; delay: number; children: React.ReactNode }) {
  return (
    <section className="rise min-w-0 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" style={{ animationDelay: `${delay}ms` }}>
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      {hint ? <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
