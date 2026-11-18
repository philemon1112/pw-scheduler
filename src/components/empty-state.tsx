import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "There's nothing here yet" — said once, properly.
 *
 * Every page grew its own version of this as a bare dashed box with a line of
 * grey text, which is how five screens end up disagreeing about what empty
 * looks like. One component so they don't.
 *
 * Two rules it enforces by shape. It always names *what* is missing rather
 * than reporting absence ("No accounts yet", not "No data") — a screen that
 * says "no data" is indistinguishable from a screen that failed to load. And
 * `action` is a slot rather than optional decoration: an empty state that
 * doesn't offer the one thing that fills it is a dead end, and the whole
 * reason someone is looking at it is that they haven't found that thing yet.
 *
 * `hint` carries the sentence that makes the wait make sense — why this screen
 * is empty and what will fill it — which matters most on the screens that
 * cannot be filled directly, like analytics waiting on spending to analyse.
 */
export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
  compact = false,
}: {
  icon: LucideIcon;
  /** What is missing, named. */
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  /** For empty states inside a card that already has a heading. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border text-center",
        compact ? "px-4 py-8" : "px-6 py-14",
        className
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-2xl bg-muted text-muted-foreground",
          compact ? "size-10" : "size-12"
        )}
      >
        <Icon className={compact ? "size-[1.0625rem]" : "size-5"} />
      </span>

      <p className={cn("mt-3 font-medium", compact ? "text-sm" : "text-[0.9375rem]")}>
        {title}
      </p>

      {hint ? (
        <p className="mt-1.5 max-w-[24rem] text-[0.8125rem] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}

      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
