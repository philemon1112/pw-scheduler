import { Shimmer, SkeletonLine } from "@/components/skeleton";

/** The page frame is known before data arrives; only the values shimmer. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="mb-6 pt-2">
        <Shimmer className="h-8 w-48" />
        <SkeletonLine className="mt-3 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <SkeletonLine className="w-24" />
            <Shimmer className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
