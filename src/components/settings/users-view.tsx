"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, LoaderCircle, Send, UserPlus } from "lucide-react";

import { inviteAction, renewInviteAction, setDisabledAction, setRoleAction } from "@/app/(app)/settings/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { whatsappLink } from "@/lib/messages/compose";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  state: "active" | "invited" | "expired" | "removed";
  lastLogin: string | null;
}

const ROLE_HINT = { editor: "Can do everything except users and settings.", viewer: "Can look, not change." };

/** Users and invites (§2): owner only. No public sign-up — an account exists because the owner made it. */
export function UsersView({ users, selfId }: { users: UserRow[]; selfId: string }) {
  const router = useRouter();
  const [form, setForm] = React.useState({ name: "", email: "", role: "editor" as "editor" | "viewer" });
  const [pending, setPending] = React.useState<string | null>(null);
  const [link, setLink] = React.useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending("invite");
    const result = await inviteAction(form).catch(() => null);
    setPending(null);
    if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
    setLink({ name: form.name, url: result.url });
    setForm({ name: "", email: "", role: "editor" });
    router.refresh();
  };

  const act = async (key: string, work: () => Promise<{ ok: boolean; error?: string }>, done: string) => {
    setPending(key);
    const result = await work().catch(() => null);
    setPending(null);
    if (!result?.ok) return void toast.error((result as { error?: string } | null)?.error ?? "That didn't go through.");
    toast.success(done);
    router.refresh();
  };

  const message = link ? `You're invited to help with the public witnessing schedule. Open this link to choose your password (it works once, for 7 days): ${link.url}` : "";

  return (
    <div className="grid grid-cols-1 gap-4">
      <form onSubmit={invite} className="rise grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <h2 className="font-display text-base font-semibold">Invite someone</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem]">
          <div className="grid gap-1.5">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="u-role">Role</Label>
            <NativeSelect id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "editor" | "viewer" })}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </NativeSelect>
          </div>
        </div>
        <p className="text-[0.75rem] text-muted-foreground">{ROLE_HINT[form.role]}</p>
        <Button type="submit" disabled={pending !== null} className="justify-self-start">
          {pending === "invite" ? <LoaderCircle className="animate-spin" /> : <UserPlus />}
          Make invite link
        </Button>
      </form>

      {link ? (
        <div className="rise grid gap-2 rounded-2xl border border-primary/40 bg-accent/40 p-4" role="status">
          <p className="text-[0.875rem] font-medium">Send this link to {link.name}. It works once, for 7 days, and isn&apos;t shown again.</p>
          <div className="flex gap-2">
            <Input readOnly value={link.url} onFocus={(e) => e.target.select()} className="font-mono text-[0.75rem]" aria-label="Invite link" />
            <Button
              variant="outline"
              aria-label="Copy invite link"
              onClick={() => {
                void navigator.clipboard.writeText(link.url);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => window.open(whatsappLink(message), "_blank", "noopener")}>
            <Send />
            Send on WhatsApp
          </Button>
        </div>
      ) : null}

      <ul className="rise grid gap-2" aria-label="Accounts">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-card">
            <span className="min-w-0 grow">
              <span className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium">
                {u.name}
                {u.id === selfId ? <span className="text-[0.75rem] font-normal text-muted-foreground">(you)</span> : null}
                <Badge size="sm" variant={u.state === "active" ? "positive" : u.state === "removed" ? "secondary" : "warning"}>
                  {u.state === "active" ? u.role[0].toUpperCase() + u.role.slice(1) : u.state === "invited" ? "Invited" : u.state === "expired" ? "Invite expired" : "Removed"}
                </Badge>
              </span>
              <span className="block truncate text-[0.8125rem] text-muted-foreground">
                {u.email}
                {u.lastLogin ? ` · last signed in ${u.lastLogin}` : ""}
              </span>
            </span>
            {u.role !== "owner" ? (
              <span className="flex flex-wrap items-center gap-1.5">
                {u.state !== "removed" ? (
                  <NativeSelect
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    onChange={(e) => void act(`role:${u.id}`, () => setRoleAction(u.id, e.target.value as "editor" | "viewer"), "Role changed")}
                    className="h-9 w-32"
                  >
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer</option>
                  </NativeSelect>
                ) : null}
                {u.state === "invited" || u.state === "expired" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending !== null}
                    onClick={async () => {
                      const result = await renewInviteAction(u.id).catch(() => null);
                      if (!result?.ok) return void toast.error(result?.error ?? "That didn't go through.");
                      setLink({ name: u.name, url: result.url });
                      router.refresh();
                    }}
                  >
                    New invite link
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending !== null}
                  onClick={() => void act(`dis:${u.id}`, () => setDisabledAction(u.id, u.state !== "removed"), u.state === "removed" ? `${u.name} can sign in again` : `${u.name} can no longer sign in`)}
                >
                  {u.state === "removed" ? "Restore" : "Remove"}
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
