import { LogOut } from "lucide-react";

import { signOutAction } from "@/app/(auth)/login/actions";
import { cn } from "@/lib/utils";

/** A form, not an onClick: signing out is a POST, and works without JavaScript. */
export function SignOutButton({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <form action={signOutAction}>
      <button type="submit" className={cn("flex w-full items-center gap-3", className)}>
        <LogOut className="size-4" />
        {children ?? "Sign out"}
      </button>
    </form>
  );
}
