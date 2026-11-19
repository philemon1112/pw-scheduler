import { evaluateAssignment } from "./evaluate";
import { explain } from "./explain";
import { iterationSeed, mulberry32 } from "./prng";
import { assignmentFrom, buildProblem, emptyAssignment, pairAllowed, pairKey, Scorer, type Assignment, type Problem } from "./problem";
import type { GenerateResult, Placement, SchedulerInput } from "./types";

const DEFAULT_ITERATIONS = 300;
/** How much a later pass may stray from the best-looking pair, so passes differ. */
const NOISE = 30;

interface Candidates {
  /** Flat [a0, b0, a1, b1, …]. */
  pairs: Int32Array;
  /** The part of each pair's cost that never changes: history, preferences. */
  fixedCost: Float64Array;
}

/** Every pair that passes the hard rules for a session, before anyone is placed. */
function candidatesFor(P: Problem, s: number): Candidates {
  const people: number[] = [];
  for (let m = 0; m < P.M; m += 1) if (P.eligible[s * P.M + m]) people.push(m);
  const pairs: number[] = [];
  const cost: number[] = [];
  const W = P.weights;
  for (let i = 0; i < people.length; i += 1) {
    for (let j = i + 1; j < people.length; j += 1) {
      const a = people[i];
      const b = people[j];
      if (!pairAllowed(P, a, b, s)) continue;
      let c = 0;
      if (P.partner[a] !== b) {
        const k = pairKey(P, a, b);
        c += P.repeatCost.get(k) ?? 0;
        if (P.prefer.has(k)) c += W.preferredPair;
      }
      if (P.locationMatch[s * P.M + a]) c += W.preferredLocation;
      if (P.locationMatch[s * P.M + b]) c += W.preferredLocation;
      pairs.push(a, b);
      cost.push(c);
    }
  }
  return { pairs: Int32Array.from(pairs), fixedCost: Float64Array.from(cost) };
}

/** Running totals for one greedy pass. */
class Running {
  load: Int32Array;
  busy: Uint8Array;
  weekCount: Uint8Array;
  slotUse: Uint8Array;
  pairUse = new Map<number, number>();

  constructor(private P: Problem) {
    this.load = new Int32Array(P.M);
    this.busy = new Uint8Array(P.M * 32);
    this.weekCount = new Uint8Array(P.M * 8);
    this.slotUse = new Uint8Array(P.M * Math.max(P.slotCount, 1));
  }

  place(s: number, a: number, b: number) {
    const { P } = this;
    for (const m of [a, b]) {
      if (m < 0) continue;
      this.load[m] += 1;
      this.busy[m * 32 + P.day[s]] += 1;
      this.weekCount[m * 8 + P.week[s]] += 1;
      if (P.slot[s] >= 0) this.slotUse[m * P.slotCount + P.slot[s]] += 1;
    }
    if (a >= 0 && b >= 0 && P.partner[a] !== b) {
      const k = pairKey(P, a, b);
      this.pairUse.set(k, (this.pairUse.get(k) ?? 0) + 1);
    }
  }

  free(m: number, s: number): boolean {
    return this.load[m] < this.P.limit[m] && this.busy[m * 32 + this.P.day[s]] === 0;
  }

  /** What placing `m` in session `s` adds, beyond the pair's fixed cost. */
  personCost(m: number, s: number): number {
    const { P } = this;
    const W = P.weights;
    const load = this.load[m];
    const limit = P.limit[m];
    let c = W.fairness * (((load + 1) / limit) ** 2 - (load / limit) ** 2);
    const w = P.week[s];
    const here = this.weekCount[m * 8 + w];
    c += here * W.sameWeek;
    if (w > 0 && this.weekCount[m * 8 + w - 1] > 0) c += W.consecutiveWeeks;
    if (w < 7 && this.weekCount[m * 8 + w + 1] > 0) c += W.consecutiveWeeks;
    if (P.slot[s] >= 0 && this.slotUse[m * P.slotCount + P.slot[s]] > 0) c += W.sameSlot;
    return c;
  }
}

/**
 * One greedy pass: sessions in order of how few pairs could fill them, each
 * given its best-scoring pair still free. Pass 0 is pure; later passes add a
 * little seeded noise to the order and the choice, so 300 passes explore 300
 * different months and the best one is kept.
 */
function greedy(P: Problem, base: Assignment, free: number[], cands: Candidates[], rng: () => number, noise: number): Assignment {
  const A = base.slice();
  const run = new Running(P);
  for (let s = 0; s < P.S; s += 1) if (P.fixed[s]) run.place(s, A[s * 2], A[s * 2 + 1]);

  const order = free
    .map((s) => ({ s, key: cands[s].fixedCost.length * (noise ? 1 + 0.25 * rng() : 1) + (noise ? 0 : s * 1e-6) }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.s);

  for (const s of order) {
    const { pairs, fixedCost } = cands[s];
    let bestA = -1;
    let bestB = -1;
    let best = Infinity;
    for (let c = 0; c < fixedCost.length; c += 1) {
      const a = pairs[c * 2];
      const b = pairs[c * 2 + 1];
      if (!run.free(a, s) || !run.free(b, s)) continue;
      let cost = fixedCost[c] + run.personCost(a, s) + run.personCost(b, s);
      if (P.partner[a] !== b) cost += (run.pairUse.get(pairKey(P, a, b)) ?? 0) * P.weights.samePairThisMonth;
      if (noise) cost += rng() * noise;
      if (cost < best) {
        best = cost;
        bestA = a;
        bestB = b;
      }
    }
    if (bestA >= 0) {
      A[s * 2] = bestA;
      A[s * 2 + 1] = bestB;
      run.place(s, bestA, bestB);
    }
  }
  return A;
}

/**
 * Local search (§8 step 5): move one person to another session, swap two
 * people between sessions, or fill a gap, keeping any change that lowers the
 * total score and breaks no hard rule. Stops when a full pass finds nothing.
 */
function improve(P: Problem, A: Assignment, free: number[], scorer: Scorer, rng: () => number): Assignment {
  const load = new Int32Array(P.M);
  const busy = new Uint8Array(P.M * 32);
  for (let s = 0; s < P.S; s += 1) {
    for (const m of [A[s * 2], A[s * 2 + 1]]) {
      if (m < 0) continue;
      load[m] += 1;
      busy[m * 32 + P.day[s]] += 1;
    }
  }
  const eligibleIn = free.map((s) => {
    const list: number[] = [];
    for (let m = 0; m < P.M; m += 1) if (P.eligible[s * P.M + m]) list.push(m);
    return list;
  });

  let current = scorer.score(A).total;
  const tryMove = (apply: () => void, undo: () => void): boolean => {
    apply();
    const next = scorer.score(A).total;
    if (next < current - 1e-9) {
      current = next;
      return true;
    }
    undo();
    return false;
  };
  const occupy = (m: number, s: number, delta: number) => {
    load[m] += delta;
    busy[m * 32 + P.day[s]] += delta;
  };

  for (let pass = 0; pass < 8; pass += 1) {
    let improved = false;
    const order = free.map((s, i) => ({ s, i, r: rng() })).sort((x, y) => x.r - y.r);

    // Fill a gap, or replace one person with someone not used that day.
    for (const { s, i } of order) {
      for (let pos = 0; pos < 2; pos += 1) {
        const x = A[s * 2 + pos];
        const other = A[s * 2 + 1 - pos];
        // Never one person alone in an empty session; gaps are filled by pairs below.
        if (x < 0 && other < 0) continue;
        for (const z of eligibleIn[i]) {
          if (z === x || z === other || load[z] >= P.limit[z] || busy[z * 32 + P.day[s]] > 0) continue;
          if (other >= 0 ? !pairAllowed(P, other, z, s) : false) continue;
          const moved = tryMove(
            () => {
              A[s * 2 + pos] = z;
              occupy(z, s, 1);
              if (x >= 0) occupy(x, s, -1);
            },
            () => {
              A[s * 2 + pos] = x;
              occupy(z, s, -1);
              if (x >= 0) occupy(x, s, 1);
            }
          );
          if (moved) {
            improved = true;
            break;
          }
        }
      }
      // An empty session with nobody valid for one place at a time: try a whole pair.
      if (A[s * 2] < 0 && A[s * 2 + 1] < 0) {
        const people = eligibleIn[i].filter((m) => load[m] < P.limit[m] && busy[m * 32 + P.day[s]] === 0);
        outer: for (let p = 0; p < people.length; p += 1) {
          for (let q = p + 1; q < people.length; q += 1) {
            const a = people[p];
            const b = people[q];
            if (!pairAllowed(P, a, b, s)) continue;
            const moved = tryMove(
              () => {
                A[s * 2] = a;
                A[s * 2 + 1] = b;
                occupy(a, s, 1);
                occupy(b, s, 1);
              },
              () => {
                A[s * 2] = -1;
                A[s * 2 + 1] = -1;
                occupy(a, s, -1);
                occupy(b, s, -1);
              }
            );
            if (moved) {
              improved = true;
              break outer;
            }
          }
        }
      }
    }

    // Swap one person in each of two sessions.
    for (let i = 0; i < free.length; i += 1) {
      for (let j = i + 1; j < free.length; j += 1) {
        const s1 = free[i];
        const s2 = free[j];
        const sameDay = P.day[s1] === P.day[s2];
        for (let p1 = 0; p1 < 2; p1 += 1) {
          for (let p2 = 0; p2 < 2; p2 += 1) {
            const x = A[s1 * 2 + p1];
            const y = A[s2 * 2 + p2];
            if (x < 0 || y < 0 || x === y) continue;
            const o1 = A[s1 * 2 + 1 - p1];
            const o2 = A[s2 * 2 + 1 - p2];
            if (o1 === y || o2 === x) continue;
            if (!P.eligible[s2 * P.M + x] || !P.eligible[s1 * P.M + y]) continue;
            if (!sameDay && (busy[x * 32 + P.day[s2]] > 0 || busy[y * 32 + P.day[s1]] > 0)) continue;
            if ((o1 >= 0 && !pairAllowed(P, o1, y, s1)) || (o2 >= 0 && !pairAllowed(P, o2, x, s2))) continue;
            const swap = () => {
              A[s1 * 2 + p1] = y;
              A[s2 * 2 + p2] = x;
              if (!sameDay) {
                occupy(x, s1, -1);
                occupy(x, s2, 1);
                occupy(y, s2, -1);
                occupy(y, s1, 1);
              }
            };
            const back = () => {
              A[s1 * 2 + p1] = x;
              A[s2 * 2 + p2] = y;
              if (!sameDay) {
                occupy(x, s2, -1);
                occupy(x, s1, 1);
                occupy(y, s1, -1);
                occupy(y, s2, 1);
              }
            };
            if (tryMove(swap, back)) improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }
  return A;
}

/**
 * Builds a month (§8). Locked placements are kept exactly and count toward
 * every limit; everything else is chosen fresh. Deterministic: the same input
 * and seed always give the same month.
 */
export function generate(input: SchedulerInput): GenerateResult {
  const started = performance.now();
  const locked = input.placements.filter((p) => p.locked);
  const P = buildProblem(input, new Set(locked.map((p) => p.sessionId)));
  const base = P.S > 0 ? assignmentFrom(P, locked) : emptyAssignment(P);
  const free: number[] = [];
  for (let s = 0; s < P.S; s += 1) if (!P.fixed[s]) free.push(s);
  const cands: Candidates[] = new Array(P.S);
  for (const s of free) cands[s] = candidatesFor(P, s);

  const iterations = Math.max(1, input.iterations ?? DEFAULT_ITERATIONS);
  const scorer = new Scorer(P);
  let best: Assignment = base;
  let bestScore = Infinity;
  for (let it = 0; it < iterations; it += 1) {
    const A = greedy(P, base, free, cands, mulberry32(iterationSeed(input.seed, it)), it === 0 ? 0 : NOISE);
    const total = scorer.score(A).total;
    if (total < bestScore) {
      bestScore = total;
      best = A;
    }
  }
  best = improve(P, best.slice(), free, scorer, mulberry32(iterationSeed(input.seed, iterations)));

  // Reasons, with each person's final count.
  scorer.score(best);
  const loads = scorer.loads();
  const seen = new Map<number, number>();
  const placements: Placement[] = [...locked];
  const mixed = new Set(input.placements.filter((p) => p.allowMixed).map((p) => p.sessionId));
  for (const s of free) {
    const a = best[s * 2];
    const b = best[s * 2 + 1];
    if (a < 0 && b < 0) continue;
    const people = [a, b].filter((m) => m >= 0);
    let reason: string | null = null;
    if (a >= 0 && b >= 0) {
      const k = pairKey(P, a, b);
      const n = (seen.get(k) ?? 0) + 1;
      seen.set(k, n);
      reason = explain(P, a, b, loads, n > 1);
    }
    placements.push({
      sessionId: P.sessions[s].id,
      memberIds: people.map((m) => P.members[m].id),
      coupleId: a >= 0 && b >= 0 && P.partner[a] === b ? P.coupleId[a] : null,
      locked: false,
      allowMixed: mixed.has(P.sessions[s].id),
      reason,
    });
  }

  return {
    placements,
    evaluation: evaluateAssignment(P, best),
    seed: input.seed,
    iterations,
    ms: Math.round(performance.now() - started),
  };
}
