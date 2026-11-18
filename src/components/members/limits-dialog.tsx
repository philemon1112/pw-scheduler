"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";

import { saveLimitsAction } from "@/app/(app)/members/actions";
import type { Limits } from "@/components/members/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PRIVILEGE_LABELS, PRIVILEGES } from "@/lib/members/limits";

/** The owner's three numbers: how many sessions each privilege may get a month. */
export function LimitsDialog({ open, onOpenChange, limits }: { open: boolean; onOpenChange: (open: boolean) => void; limits: Limits }) {
  const router = useRouter();
  const [values, setValues] = React.useState(() => Object.fromEntries(PRIVILEGES.map((p) => [p, String(limits[p])])) as Record<keyof Limits, string>);
  const [pending, setPending] = React.useState(false);

  const save = async () => {
    setPending(true);
    const result = await saveLimitsAction(Object.fromEntries(PRIVILEGES.map((p) => [p, Number(values[p])])) as Limits).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save. Check your connection and try again.");
    toast.success("Limits saved");
    onOpenChange(false);
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monthly limits</DialogTitle>
          <DialogDescription>The most sessions the scheduler gives each privilege in a month. A person can have their own limit instead.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {PRIVILEGES.map((privilege) => (
            <div key={privilege} className="flex items-center justify-between gap-4">
              <Label htmlFor={`limit-${privilege}`}>{PRIVILEGE_LABELS[privilege]}</Label>
              <Input
                id={`limit-${privilege}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={31}
                value={values[privilege]}
                onChange={(event) => setValues({ ...values, [privilege]: event.target.value })}
                className="tabular w-24 text-right"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={pending}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            Save limits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
