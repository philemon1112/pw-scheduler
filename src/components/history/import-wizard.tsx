"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleAlert, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";

import { commitImportAction, previewImportAction } from "@/app/(app)/history/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { CommitInput, ImportPreview } from "@/db/mutations/import";
import { monthLabel } from "@/lib/dates/calendar";
import { cn } from "@/lib/utils";

type Choice = CommitInput["names"][string] | null;

const toValue = (c: Choice) =>
  !c ? "" : "memberId" in c ? `m:${c.memberId}` : "coupleId" in c ? `c:${c.coupleId}` : "create" in c ? `new:${c.create.title}` : "skip";
const fromValue = (v: string): Choice =>
  v.startsWith("m:") ? { memberId: v.slice(2) } : v.startsWith("c:") ? { coupleId: v.slice(2) } : v === "new:Bro" || v === "new:Sis" ? { create: { title: v.slice(4) as "Bro" | "Sis" } } : v === "skip" ? { skip: true } : null;

/**
 * Importing an old .xlsx (§9): choose the file and its month, then review —
 * which location each table is, which slot each column is, and who each
 * name is — before anything is saved.
 */
export function ImportWizard({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [pending, setPending] = React.useState(false);
  const [tables, setTables] = React.useState<{ index: number; locationId: string | null; slotIds: (string | null)[] }[]>([]);
  const [names, setNames] = React.useState<Record<string, Choice>>({});

  const upload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await previewImportAction(new FormData(event.currentTarget)).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "That file couldn't be read.");
    const p = result.preview;
    setPreview(p);
    setTables(p.tables.map((t) => ({ index: t.index, locationId: t.locationId, slotIds: t.columns.map((c) => c.slotId) })));
    setNames(Object.fromEntries(p.names.map((n) => [n.raw, n.match ? (n.match.kind === "member" ? { memberId: n.match.id } : { coupleId: n.match.id }) : null])));
  };

  const unresolved = Object.values(names).filter((c) => c === null).length;

  const commit = async () => {
    if (!preview) return;
    setPending(true);
    const result = await commitImportAction({
      batchId: preview.batchId,
      month: preview.month,
      tables,
      names: Object.fromEntries(Object.entries(names).filter((e): e is [string, NonNullable<Choice>] => e[1] !== null)),
    }).catch(() => null);
    setPending(false);
    if (!result?.ok) return void toast.error(result?.error ?? "The import didn't go through.");
    toast.success(`${monthLabel(preview.month)} imported`, {
      description: `${result.sessions} sessions${result.membersCreated ? `, ${result.membersCreated} new members` : ""}${result.skipped ? `, ${result.skipped} cells left out` : ""}.`,
    });
    router.push(`/schedule/${preview.month}`);
  };

  if (!preview) {
    return (
      <form onSubmit={upload} className="rise grid max-w-lg gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="grid gap-1.5">
          <Label htmlFor="imp-month">Which month is it?</Label>
          <Input id="imp-month" name="month" type="month" defaultValue={defaultMonth} required className="w-48" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="imp-file">The schedule (Excel .xlsx or Word .docx)</Label>
          <Input
            id="imp-file"
            name="file"
            type="file"
            accept=".xlsx,.docx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            required
          />
          <p className="text-[0.75rem] text-muted-foreground">Laid out like the printed sheet: a coloured title row per location, a day row, a time row starting with WEEK, then Week 1, Week 2… with two names per cell.</p>
        </div>
        <Button type="submit" disabled={pending} className="justify-self-start">
          {pending ? <LoaderCircle className="animate-spin" /> : <Upload />}
          Read the sheet
        </Button>
      </form>
    );
  }

  const memberName = new Map(preview.members.map((m) => [m.id, m.name]));
  const unknown = new Set(Object.entries(names).filter(([, c]) => c === null).map(([raw]) => raw));

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rise flex flex-wrap items-center gap-3">
        <FileSpreadsheet className="size-5 text-primary" />
        <p className="text-[0.9375rem]">
          <span className="font-semibold">{preview.filename}</span> as {monthLabel(preview.month)}
        </p>
        <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
          Choose another file
        </Button>
      </div>

      {preview.blocked ? (
        <p className="rise flex gap-2 rounded-xl border border-danger-border bg-danger px-3.5 py-2.5 text-[0.8125rem] text-danger-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {monthLabel(preview.month)} already has pairs made in the app, so it can&apos;t be imported over. Choose another month.
        </p>
      ) : null}

      {preview.tables.map((t, ti) => {
        const choice = tables[ti];
        const location = preview.locations.find((l) => l.id === choice.locationId);
        return (
          <section key={t.index} className="rise min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-card" aria-label={t.title}>
            <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: t.color ?? "var(--muted)" }} aria-hidden />
              <span className="grow text-[0.875rem] font-semibold">{t.title || "Untitled table"}</span>
              <Label htmlFor={`loc-${ti}`} className="sr-only">
                Location
              </Label>
              <NativeSelect
                id={`loc-${ti}`}
                value={choice.locationId ?? ""}
                onChange={(e) => setTables(tables.map((x, k) => (k === ti ? { ...x, locationId: e.target.value || null, slotIds: x.slotIds.map(() => null) } : x)))}
                className="w-64"
              >
                <option value="">Don&apos;t import this table</option>
                {preview.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </NativeSelect>
            </header>
            {choice.locationId ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-[0.8125rem]">
                  <thead>
                    <tr className="align-top">
                      <th className="w-20 px-3 py-2 text-[0.75rem] font-medium text-muted-foreground">Week</th>
                      {t.columns.map((col, c) => (
                        <th key={c} className="min-w-40 px-2 py-2 font-normal">
                          <span className="block text-[0.75rem] text-muted-foreground">
                            {col.day} · {col.time}
                          </span>
                          <NativeSelect
                            aria-label={`Slot for ${col.day} ${col.time}`}
                            value={choice.slotIds[c] ?? ""}
                            onChange={(e) => setTables(tables.map((x, k) => (k === ti ? { ...x, slotIds: x.slotIds.map((s, j) => (j === c ? e.target.value || null : s)) } : x)))}
                            className={cn("mt-1 h-8 text-[0.75rem]", !choice.slotIds[c] && "border-warning-border")}
                          >
                            <option value="">Leave out</option>
                            {location?.slots.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </NativeSelect>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.weeks.map((w) => (
                      <tr key={w.week} className="border-t border-border/70 align-top">
                        <th className="px-3 py-2 font-medium">Week {w.week}</th>
                        {w.cells.map((cell, c) => (
                          <td key={c} className={cn("px-2 py-2", !choice.slotIds[c] && "opacity-40")}>
                            {cell.length === 0 ? <span className="text-muted-foreground/60">—</span> : null}
                            {cell.map((n) => (
                              <span key={n} className={cn("block", unknown.has(n) && "rounded bg-warning px-1 text-warning-foreground")}>
                                {n}
                              </span>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        );
      })}

      <section className="rise grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5" aria-labelledby="names">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="names" className="font-display text-base font-semibold">
            Names
          </h2>
          {unresolved ? <Badge variant="warning">{unresolved} to check</Badge> : <Badge variant="positive">All matched</Badge>}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(names)
            .sort((a, b) => Number(a[1] !== null) - Number(b[1] !== null) || a[0].localeCompare(b[0]))
            .map(([raw, choice]) => (
              <li key={raw} className={cn("grid gap-1 rounded-xl border p-2.5", choice === null ? "border-warning-border bg-warning/40" : "border-border")}>
                <span className="text-[0.8125rem] font-medium">{raw}</span>
                <NativeSelect aria-label={`Who is ${raw}`} value={toValue(choice)} onChange={(e) => setNames({ ...names, [raw]: fromValue(e.target.value) })} className="h-9 text-[0.8125rem]">
                  <option value="">Choose…</option>
                  <optgroup label="Add as a new member">
                    <option value="new:Bro">New: Bro {raw}</option>
                    <option value="new:Sis">New: Sis {raw}</option>
                  </optgroup>
                  <option value="skip">Leave this name out</option>
                  <optgroup label="Couples">
                    {preview.couples.map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Members">
                    {preview.members.map((m) => (
                      <option key={m.id} value={`m:${m.id}`}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                </NativeSelect>
                {choice && "memberId" in choice && memberName.get(choice.memberId)?.replace(/^(Bro|Sis) /, "") !== raw ? (
                  <span className="text-[0.6875rem] text-muted-foreground">Read as {memberName.get(choice.memberId)}</span>
                ) : null}
              </li>
            ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void commit()} disabled={pending || unresolved > 0 || preview.blocked}>
          {pending ? <LoaderCircle className="animate-spin" /> : null}
          Import {monthLabel(preview.month)}
        </Button>
        <Link href="/history" className="text-[0.8125rem] text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
        {unresolved > 0 ? <span className="text-[0.8125rem] text-muted-foreground">Match or leave out every name first.</span> : null}
      </div>
    </div>
  );
}
