"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";

import { NAV_ITEMS, isActive } from "@/components/shell/nav-items";
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The phone's tab bar: a floating pane of chrome glass, so the schedule
 * scrolls visibly *under* it rather than stopping at a line (Budgeteer's
 * mobile nav). Three tabs and "More", which opens a sheet with the rest —
 * seven labelled destinations would not fit 360px at a 44px touch size.
 *
 * Inset by the safe area, which keeps it clear of the home indicator.
 */
export function TabBar({ footer }: { footer: React.ReactNode }) {
  const pathname = usePathname();
  const [more, setMore] = React.useState(false);
  const tabs = NAV_ITEMS.filter((item) => item.tab);
  const rest = NAV_ITEMS.filter((item) => !item.tab);
  const restActive = rest.some((item) => isActive(item, pathname));

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[1.25rem] text-[0.6875rem] font-medium transition-colors duration-150 ease-[var(--ease-out)]",
      "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
      active ? "bg-inverted text-inverted-foreground" : "text-muted-foreground"
    );

  return (
    <>
      <nav aria-label="Primary" className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 md:hidden">
        <ul className="glass-chrome grid grid-cols-4 gap-1 rounded-[1.6rem] p-1.5 shadow-pop">
          {tabs.map((item) => {
            const active = isActive(item, pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                  <Icon className="size-[1.125rem]" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setMore(true)} className={cn(tabClass(restActive), "w-full")} aria-haspopup="dialog">
              <Ellipsis className="size-[1.125rem]" />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <ul className="grid gap-1">
              {rest.map((item) => {
                const Icon = item.icon;
                const active = isActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMore(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn("row-hover flex min-h-12 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium", active && "bg-muted")}
                    >
                      <Icon className="size-[1.125rem] text-muted-foreground" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li className="mt-2 border-t border-border pt-2">{footer}</li>
            </ul>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
