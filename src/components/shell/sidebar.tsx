"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS, isActive } from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

/**
 * The desktop sidebar: Budgeteer's inverted surface, used here as the frame.
 *
 * The active item is the one place a light pill appears on the dark — a
 * single, unmistakable "you are here", with `aria-current` saying the same to
 * a screen reader. Everything else is muted type that brightens on hover.
 */
export function Sidebar({ congregation, user, footer }: { congregation: string; user: { name: string; role: string }; footer: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-inverted text-inverted-foreground md:flex">
      <div className="px-5 pt-6 pb-5">
        <p className="font-display text-[1.0625rem] font-bold tracking-tight">PW Scheduler</p>
        <p className="mt-0.5 truncate text-[0.75rem] text-inverted-muted">{congregation}</p>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3">
        <ul className="grid gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.875rem] font-medium transition-colors duration-150 ease-[var(--ease-out)]",
                    "outline-none focus-visible:ring-[3px] focus-visible:ring-white/30",
                    active ? "bg-white/[0.12] text-white" : "text-inverted-muted hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <Icon className="size-[1.0625rem]" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-inverted-border px-5 py-4">
        <p className="truncate text-[0.8125rem] font-medium">{user.name}</p>
        <p className="text-[0.6875rem] capitalize text-inverted-muted">{user.role}</p>
        <div className="mt-3">{footer}</div>
      </div>
    </aside>
  );
}
