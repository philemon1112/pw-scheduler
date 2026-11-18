import { cn } from "@/lib/utils";

/**
 * Loading placeholders for *values*, not for layouts — Budgeteer's rule.
 *
 * A page's frame, headings and labels are known before any query runs, so a
 * loading screen renders the real frame and puts one of these where each
 * unknown value goes. The layout is final from the first paint, and nothing
 * shifts when the data lands. Widths vary the way real text does, so a column
 * of bars reads as text on its way rather than as a loading graphic.
 */
export function Shimmer({ className }: { className?: string }) {
  return <span className={cn("shimmer block rounded-md", className)} aria-hidden />;
}

export function SkeletonLine({ className }: { className?: string }) {
  return <Shimmer className={cn("h-3.5", className)} />;
}
