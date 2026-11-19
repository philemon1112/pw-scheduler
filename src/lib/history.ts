export interface PairStat {
  a: string;
  b: string;
  count: number;
  months: string[];
  dates: string[];
  isCouple: boolean;
}

const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Who has served with whom, how often and when (§9's pair-history matrix). */
export function pairStats(sessions: { month: string; date: string; memberIds: string[]; isCouple: boolean }[]): Map<string, PairStat> {
  const out = new Map<string, PairStat>();
  for (const s of sessions) {
    if (s.memberIds.length !== 2) continue;
    const [a, b] = [...s.memberIds].sort();
    const k = key(a, b);
    const stat = out.get(k) ?? { a, b, count: 0, months: [], dates: [], isCouple: s.isCouple };
    stat.count += 1;
    if (!stat.months.includes(s.month)) stat.months.push(s.month);
    stat.dates.push(s.date);
    stat.isCouple ||= s.isCouple;
    out.set(k, stat);
  }
  return out;
}

export const pairOf = (stats: Map<string, PairStat>, a: string, b: string) => stats.get(key(a, b)) ?? null;

/**
 * "x of y pairs repeated from last month" (§9), counted per session with
 * couples left out — the same rule as the builder's card (D6).
 */
export function monthComparison(sessions: { month: string; memberIds: string[]; isCouple: boolean; date: string }[], month: string, previous: string) {
  const pairs = (m: string) => sessions.filter((s) => s.month === m && s.memberIds.length === 2 && !s.isCouple);
  const before = new Set(pairs(previous).map((s) => key(s.memberIds[0], s.memberIds[1])));
  const now = pairs(month);
  const repeated = now.filter((s) => before.has(key(s.memberIds[0], s.memberIds[1])));
  return { pairs: now.length, repeated: repeated.length, sessions: repeated };
}
