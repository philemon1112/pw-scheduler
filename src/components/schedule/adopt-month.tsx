"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, PlayCircle } from "lucide-react";

import { adoptMonthAction } from "@/app/(app)/schedule/actions";
import { Button } from "@/components/ui/button";

/** On an imported month that isn't over: make it the live schedule (D32). */
export function AdoptMonth({ month, monthName }: { month: string; monthName: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <div className="rise flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-accent/40 p-4">
      <p className="max-w-2xl text-[0.8125rem]">
        <span className="font-semibold">{monthName} came from your file.</span> Use it in the app to swap people by hand, and so members see these sessions on their own pages. The weekend message works either way.
      </p>
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          const result = await adoptMonthAction(month).catch(() => null);
          setPending(false);
          if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
          toast.success(`${monthName} is now live in the app`);
          router.refresh();
        }}
      >
        {pending ? <LoaderCircle className="animate-spin" /> : <PlayCircle />}
        Use this month in the app
      </Button>
    </div>
  );
}
