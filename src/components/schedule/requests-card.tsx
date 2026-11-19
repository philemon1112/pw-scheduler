"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarX2, Send, UserCheck } from "lucide-react";

import { dismissRequestAction } from "@/app/(app)/schedule/actions";
import { Button } from "@/components/ui/button";
import type { OpenRequest } from "@/db/queries/schedule";
import { whatsappLink } from "@/lib/messages/compose";

/**
 * Can't-make-it requests from members' links (§13), at the top of the
 * builder: ask a suggested replacement on WhatsApp, open the session to
 * change it (which closes the request), or keep the person after all.
 */
export function RequestsCard({ requests, canEdit, onOpen }: { requests: OpenRequest[]; canEdit: boolean; onOpen: (sessionId: string) => void }) {
  const router = useRouter();
  if (requests.length === 0) return null;

  const keep = async (id: string) => {
    const result = await dismissRequestAction(id).catch(() => null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    toast.success("Request closed; nothing changed");
    router.refresh();
  };

  return (
    <section className="rise grid gap-3 rounded-2xl border border-danger-border bg-danger/60 p-4" aria-labelledby="requests">
      <h2 id="requests" className="flex items-center gap-2 font-display text-base font-semibold text-danger-foreground">
        <CalendarX2 className="size-4" />
        {requests.length === 1 ? "1 person can't make it" : `${requests.length} people can't make it`}
      </h2>
      <ul className="grid gap-2">
        {requests.map((r) => (
          <li key={r.id} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[0.875rem] font-semibold">{r.who}</p>
            <p className="text-[0.8125rem] text-muted-foreground">
              {r.when}
              {r.reason ? ` · “${r.reason}”` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {canEdit
                ? r.asks.map((a) =>
                    a.phone ? (
                      <Button key={a.memberId} size="sm" variant="outline" onClick={() => window.open(whatsappLink(a.text, a.phone), "_blank", "noopener")}>
                        <Send />
                        Ask {a.name}
                      </Button>
                    ) : null
                  )
                : null}
              <Button size="sm" variant={canEdit ? "default" : "outline"} onClick={() => onOpen(r.sessionId)}>
                Open session
              </Button>
              {canEdit ? (
                <Button size="sm" variant="ghost" onClick={() => void keep(r.id)}>
                  <UserCheck />
                  Keep them
                </Button>
              ) : null}
            </div>
            {canEdit && r.asks.length > 0 && r.asks.every((a) => !a.phone) ? (
              <p className="mt-1.5 text-[0.75rem] text-muted-foreground">Suggested: {r.asks.map((a) => a.name).join(", ")} (no numbers saved yet).</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
