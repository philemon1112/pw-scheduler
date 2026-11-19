"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { saveWeightsAction } from "@/app/(app)/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Weights } from "@/lib/scheduler/types";

const LABELS: Record<keyof Weights, string> = {
  unfilled: "A session left empty",
  hardBreak: "A rule broken (only by a lock or hand edit)",
  repeat1: "Same pair as last month",
  repeat2: "Same pair as two months ago",
  repeat3: "Same pair as three months ago",
  repeatOlder: "Same pair, earlier in the repeat window",
  samePairThisMonth: "Same pair twice this month",
  fairness: "Uneven load (squared)",
  sameWeek: "Twice in one week",
  consecutiveWeeks: "Serving in back-to-back weeks",
  sameSlot: "The same slot again",
  preferredLocation: "Their preferred location (negative is a bonus)",
  preferredPair: "A pair marked “prefer” (negative is a bonus)",
};

/** Scoring weights (§8, advanced): how much the builder dislikes each thing. Bigger avoids it harder. */
export function WeightsCard({ weights, defaults, custom }: { weights: Weights; defaults: Weights; custom: boolean }) {
  const router = useRouter();
  const [values, setValues] = React.useState(weights);
  const [pending, setPending] = React.useState(false);
  const dirty = JSON.stringify(values) !== JSON.stringify(weights);

  const save = async (next: Weights | null) => {
    setPending(true);
    const result = await saveWeightsAction(next).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save.");
    if (!next) setValues(defaults);
    toast.success(next ? "Weights saved — the next Generate uses them" : "Back to the built-in weights");
    router.refresh();
  };

  return (
    <details className="rise rounded-2xl border border-border bg-card shadow-card [&[open]>summary]:border-b">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 border-border px-4 py-3 sm:px-5">
        <span>
          <span className="block font-display text-base font-semibold">Scoring (advanced)</span>
          <span className="block text-[0.8125rem] text-muted-foreground">{custom ? "Custom weights in use." : "The built-in weights."} Only change these if the builder keeps choosing badly.</span>
        </span>
      </summary>
      <div className="grid gap-4 p-4 sm:p-5">
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {(Object.keys(LABELS) as (keyof Weights)[]).map((key) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`w-${key}`} className="font-normal">
                {LABELS[key]}
              </Label>
              <Input
                id={`w-${key}`}
                type="number"
                inputMode="decimal"
                value={values[key]}
                onChange={(e) => setValues({ ...values, [key]: Number(e.target.value) })}
                className="w-24 text-right"
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save(values)} disabled={pending || !dirty}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Save weights
          </Button>
          <Button variant="ghost" onClick={() => void save(null)} disabled={pending || !custom}>
            <RotateCcw />
            Built-in weights
          </Button>
        </div>
      </div>
    </details>
  );
}
