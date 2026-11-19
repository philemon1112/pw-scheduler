"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { resetTemplateAction, saveTemplateAction } from "@/app/(app)/messages/actions";
import { WaText } from "@/components/messages/wa-text";
import { Button } from "@/components/ui/button";
import { DEFAULT_TEMPLATES, fill, KIND_LABELS, PLACEHOLDERS, type MessageKind } from "@/lib/messages/templates";

const SAMPLE: Record<string, string> = {
  greeting: "Good Afternoon",
  name: "Bro Philemon Abakah",
  title: "Bro",
  month: "December 2026",
  my_sessions: "• Fri 4 Dec · 6:00 – 8:00 am with Bro Henry Atsu Damey at Haatso - near MTN office\n• Sat 19 Dec · 9:30 – 11:30 am with Bro Kofi Adusei at Police Station – Westlands",
  partner: "Bro Henry Atsu Damey",
  date: "4 Dec",
  day: "Friday",
  time: "6:00 – 8:00 am",
  location: "Haatso - near MTN office",
  calendar_link: "https://…/m/…",
  availability_link: "https://…/m/…/availability",
  weekend_blocks:
    "Please find below the public witnessing schedule from *Friday to Sunday* at the location near the *Haatso - near MTN office*.\n\n*Friday*\n*Time:* 6:00 – 8:00 am\n*Partners:* Bro Philemon Abakah & Bro Henry Atsu Damey\n\nKindly indicate your availability for any of the sessions here or via direct message. Kindly communicate if you would like to be rescheduled.\nThank you",
};

const ORDER: MessageKind[] = ["weekend_group", "monthly_preview", "pair_reminder", "swap_offer"];

/** Wording (§12): each template with chips that insert its placeholders, and a preview with sample values. */
export function WordingTab({ templates, canEdit }: { templates: Record<MessageKind, string>; canEdit: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {ORDER.map((kind, i) => (
        <TemplateCard key={kind} kind={kind} saved={templates[kind]} canEdit={canEdit} delay={i * 50} />
      ))}
    </div>
  );
}

function TemplateCard({ kind, saved, canEdit, delay }: { kind: MessageKind; saved: string; canEdit: boolean; delay: number }) {
  const router = useRouter();
  const [body, setBody] = React.useState(saved);
  const [pending, setPending] = React.useState(false);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const chips = PLACEHOLDERS.filter((p) => p.kinds.includes(kind));

  const insert = (key: string) => {
    const el = area.current;
    if (!el) return;
    const at = el.selectionStart ?? body.length;
    const next = `${body.slice(0, at)}{${key}}${body.slice(el.selectionEnd ?? at)}`;
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at + key.length + 2, at + key.length + 2);
    });
  };

  const save = async () => {
    setPending(true);
    const result = await saveTemplateAction(kind, body).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't save.");
    toast.success(`${KIND_LABELS[kind]} saved`);
    router.refresh();
  };

  const reset = async () => {
    setPending(true);
    const result = await resetTemplateAction(kind).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    setBody(DEFAULT_TEMPLATES[kind]);
    toast.success("Back to the original wording");
    router.refresh();
  };

  return (
    <section className="rise grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" style={{ animationDelay: `${delay}ms` }} aria-labelledby={`t-${kind}`}>
      <h2 id={`t-${kind}`} className="font-display text-base font-semibold tracking-tight">
        {KIND_LABELS[kind]}
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-2">
          <textarea
            ref={area}
            value={body}
            readOnly={!canEdit}
            onChange={(event) => setBody(event.target.value)}
            aria-label={`${KIND_LABELS[kind]} wording`}
            className="min-h-40 w-full rounded-xl border border-input bg-background px-3.5 py-3 font-mono text-[0.8125rem] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
          />
          {canEdit ? (
            <div className="flex flex-wrap gap-1.5" aria-label="Insert a placeholder">
              {chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  title={chip.hint}
                  onClick={() => insert(chip.key)}
                  className="min-h-8 rounded-full border border-border bg-background px-2.5 font-mono text-[0.75rem] text-muted-foreground transition-colors hover:border-primary hover:text-foreground pointer-coarse:min-h-11"
                >
                  {`{${chip.key}}`}
                </button>
              ))}
            </div>
          ) : null}
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={pending || body === saved}>
                {pending ? <LoaderCircle className="animate-spin" /> : null}
                Save wording
              </Button>
              <Button variant="ghost" onClick={() => void reset()} disabled={pending || saved === DEFAULT_TEMPLATES[kind]}>
                <RotateCcw />
                Original wording
              </Button>
            </div>
          ) : null}
        </div>
        <div className="grid content-start gap-1.5">
          <p className="text-[0.75rem] font-medium text-muted-foreground">How it reads</p>
          <WaText text={fill(body, SAMPLE)} />
        </div>
      </div>
    </section>
  );
}
