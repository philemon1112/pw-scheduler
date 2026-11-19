import { pairPhrase } from "./explain";
import { assignmentFrom, buildProblem, pairAllowed, Scorer, type Problem } from "./problem";
import type { SchedulerInput, Suggestion } from "./types";

export interface SessionSuggestions {
  /** For each person in the session, up to three people who could take their place. */
  replace: Record<string, Suggestion[]>;
  /** For an empty or half-empty session, up to three ways to fill it. */
  fill: Suggestion[];
}

const firstName = (P: Problem, m: number) => P.members[m].name.split(" ")[0];

/**
 * The swap panel's top three (§8): who could step in for one person, or fill
 * a gap, without breaking a hard rule, ranked by how much the month's total
 * score changes. Each comes with the reason in a few words.
 */
export function suggest(input: SchedulerInput, sessionId: string, limit = 3): SessionSuggestions {
  const P = buildProblem(input);
  const s = P.sessionIndex.get(sessionId);
  if (s === undefined) return { replace: {}, fill: [] };

  const A = assignmentFrom(P, input.placements);
  const scorer = new Scorer(P);
  const base = scorer.score(A).total;
  const loads = scorer.loads().slice();
  const busy = new Uint8Array(P.M * 32);
  for (let t = 0; t < P.S; t += 1) {
    if (t === s) continue;
    for (const m of [A[t * 2], A[t * 2 + 1]]) if (m >= 0) busy[m * 32 + P.day[t]] = 1;
  }
  const inSession = new Set([A[s * 2], A[s * 2 + 1]].filter((m) => m >= 0));
  const open = (m: number) => P.eligible[s * P.M + m] === 1 && !inSession.has(m) && busy[m * 32 + P.day[s]] === 0 && loads[m] < P.limit[m];

  const reasonFor = (m: number, partner: number) => {
    const parts = ["Free that day", `${loads[m]} of ${P.limit[m]} used`];
    if (partner >= 0) parts.push(pairPhrase(P, m, partner).replace(/^First time together$/, `First time with ${firstName(P, partner)}`));
    return parts.join(" · ");
  };

  const trial = (pos: number, z: number) => {
    const before = A[s * 2 + pos];
    A[s * 2 + pos] = z;
    const delta = scorer.score(A).total - base;
    A[s * 2 + pos] = before;
    return delta;
  };

  const replace: Record<string, Suggestion[]> = {};
  const fill: Suggestion[] = [];

  for (let pos = 0; pos < 2; pos += 1) {
    const x = A[s * 2 + pos];
    const other = A[s * 2 + 1 - pos];
    if (x < 0 && other < 0) continue;
    const options: Suggestion[] = [];
    for (let z = 0; z < P.M; z += 1) {
      if (!open(z) || (other >= 0 && !pairAllowed(P, other, z, s))) continue;
      options.push({
        memberIds: [P.members[z].id],
        replaces: x >= 0 ? [P.members[x].id] : [],
        delta: trial(pos, z),
        reason: reasonFor(z, other),
      });
    }
    options.sort((p, q) => p.delta - q.delta);
    if (x >= 0) replace[P.members[x].id] = options.slice(0, limit);
    else fill.push(...options.slice(0, limit));
  }

  if (inSession.size === 0) {
    const people: number[] = [];
    for (let m = 0; m < P.M; m += 1) if (open(m)) people.push(m);
    const options: Suggestion[] = [];
    for (let i = 0; i < people.length; i += 1) {
      for (let j = i + 1; j < people.length; j += 1) {
        const a = people[i];
        const b = people[j];
        if (!pairAllowed(P, a, b, s)) continue;
        A[s * 2] = a;
        A[s * 2 + 1] = b;
        const delta = scorer.score(A).total - base;
        options.push({ memberIds: [P.members[a].id, P.members[b].id], replaces: [], delta, reason: `${pairPhrase(P, a, b)} · ${loads[a]} of ${P.limit[a]} and ${loads[b]} of ${P.limit[b]} used` });
      }
    }
    A[s * 2] = -1;
    A[s * 2 + 1] = -1;
    options.sort((p, q) => p.delta - q.delta);
    fill.push(...options.slice(0, limit));
  }

  return { replace, fill };
}
