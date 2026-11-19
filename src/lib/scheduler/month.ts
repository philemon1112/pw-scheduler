/** Whole months from `b` to `a`: monthsBetween("2026-11", "2026-09") === 2. */
export function monthsBetween(a: string, b: string): number {
  return Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7)) - (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7)));
}

/** "Jul" — or "Jul 2025" when it isn't the same year as `relativeTo`. */
export function monthShort(month: string, relativeTo?: string): string {
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return relativeTo && relativeTo.slice(0, 4) !== month.slice(0, 4) ? `${label} ${month.slice(0, 4)}` : label;
}
