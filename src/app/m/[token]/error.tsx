"use client";

export default function MemberError({ reset }: { reset: () => void }) {
  return (
    <div className="rise rounded-2xl border border-border bg-card p-6 shadow-card">
      <h1 className="font-display text-xl font-semibold">Please wait a moment</h1>
      <p className="mt-2 text-[0.875rem] text-muted-foreground">Too many tries, or the connection dropped. Wait a minute and try again.</p>
      <button type="button" onClick={reset} className="mt-4 min-h-11 rounded-full bg-primary px-5 text-[0.875rem] font-medium text-primary-foreground">
        Try again
      </button>
    </div>
  );
}
