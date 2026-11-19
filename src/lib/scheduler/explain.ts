import { monthShort, monthsBetween } from "./month";
import { pairKey, type Problem } from "./problem";

/** "Not together since Jul" / "First time together" / "Couple". */
export function pairPhrase(P: Problem, a: number, b: number): string {
  if (P.partner[a] === b) return "Couple";
  const last = P.lastTogether.get(pairKey(P, a, b));
  if (!last) return "First time together";
  const age = monthsBetween(P.input.month, last);
  if (age <= 1 || (last === P.lastMonth && age <= P.input.repeatWindowMonths)) return `Also together in ${monthShort(last, P.input.month)}`;
  return `Not together since ${monthShort(last, P.input.month)}`;
}

const used = (P: Problem, m: number, load: number) => `${load} of ${P.limit[m]}`;

/**
 * The one line stored with each generated assignment (§8), e.g.
 * "Not together since Jul · 2 of 4 and 1 of 2 used".
 */
export function explain(P: Problem, a: number, b: number, loads: Int32Array, twiceThisMonth: boolean): string {
  const pair = twiceThisMonth && P.partner[a] !== b ? "Together twice this month, the best option left" : pairPhrase(P, a, b);
  const loadA = used(P, a, loads[a]);
  const loadB = used(P, b, loads[b]);
  return `${pair} · ${loadA === loadB ? `${loadA} used each` : `${loadA} and ${loadB} used`}`;
}
