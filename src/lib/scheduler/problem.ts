import { monthsBetween } from "./month";
import type { EngineMember, EngineSession, Placement, SchedulerInput, ScoreBreakdown, Weights } from "./types";

export const DEFAULT_WEIGHTS: Weights = {
  unfilled: 1000,
  hardBreak: 500,
  repeat1: 100,
  repeat2: 60,
  repeat3: 30,
  repeatOlder: 15,
  samePairThisMonth: 150,
  fairness: 120,
  sameWeek: 40,
  consecutiveWeeks: 15,
  sameSlot: 5,
  preferredLocation: -5,
  preferredPair: -20,
};

export function weightsFrom(custom: Partial<Weights> | Record<string, number> | null | undefined): Weights {
  const weights = { ...DEFAULT_WEIGHTS };
  for (const [key, value] of Object.entries(custom ?? {})) {
    if (key in weights && typeof value === "number" && Number.isFinite(value)) weights[key as keyof Weights] = value;
  }
  return weights;
}

/** Can this person be placed in this session at all? (Hard constraint 1.) */
export function isEligible(member: EngineMember, session: EngineSession): boolean {
  if (!member.active || member.limit <= 0) return false;
  if (member.pausedUntil && session.date <= member.pausedUntil) return false;
  if (member.away.some((range) => session.date >= range.start && session.date <= range.end)) return false;
  switch (member.mode) {
    case "flexible":
      return true;
    case "specific":
      return session.slotId !== null && member.slotIds.includes(session.slotId);
    case "ask_monthly":
      return member.confirmedThisMonth;
  }
}

/**
 * The problem in index form. Members and live sessions get small integer
 * indexes and everything the inner loops read sits in typed arrays, which is
 * what keeps 300 passes over a month well under the 2 s budget.
 */
export interface Problem {
  input: SchedulerInput;
  weights: Weights;
  M: number;
  S: number;
  members: EngineMember[];
  memberIndex: Map<string, number>;
  /** Live (not cancelled) sessions only. */
  sessions: EngineSession[];
  sessionIndex: Map<string, number>;
  female: Uint8Array;
  limit: Int32Array;
  partner: Int32Array;
  /** 1 when this person only serves with their partner. */
  together: Uint8Array;
  coupleId: (string | null)[];
  day: Int32Array;
  week: Int32Array;
  slot: Int32Array;
  slotCount: number;
  locationMatch: Uint8Array;
  allowMixed: Uint8Array;
  /** `eligible[s * M + m]`. */
  eligible: Uint8Array;
  /** Members who could serve at least once this month, grouped by privilege for fairness. */
  pool: number[];
  poolGroup: Int32Array;
  groups: number;
  never: Set<number>;
  prefer: Set<number>;
  /** Penalty for a pair from history, by pair key. */
  repeatCost: Map<number, number>;
  /** Most recent month each pair served together, any age. */
  lastTogether: Map<number, string>;
  /** The latest earlier month in the history, for "repeated from Sep". */
  lastMonth: string | null;
  lastMonthPairs: Set<number>;
  /** Sessions whose placement must not change. */
  fixed: Uint8Array;
}

export const pairKey = (P: Pick<Problem, "M">, a: number, b: number) => (a < b ? a * P.M + b : b * P.M + a);

export function buildProblem(input: SchedulerInput, fixedIds: Set<string> = new Set()): Problem {
  const weights = weightsFrom(input.weights);
  const members = input.members;
  const M = members.length;
  const memberIndex = new Map(members.map((m, i) => [m.id, i]));
  const sessions = input.sessions.filter((s) => !s.isCancelled);
  const S = sessions.length;
  const sessionIndex = new Map(sessions.map((s, i) => [s.id, i]));
  const key = (a: number, b: number) => (a < b ? a * M + b : b * M + a);

  const female = new Uint8Array(M);
  const limit = new Int32Array(M);
  members.forEach((m, i) => {
    female[i] = m.gender === "F" ? 1 : 0;
    limit[i] = Math.max(0, m.limit);
  });

  const partner = new Int32Array(M).fill(-1);
  const together = new Uint8Array(M);
  const coupleId: (string | null)[] = new Array(M).fill(null);
  for (const couple of input.couples) {
    const a = memberIndex.get(couple.a);
    const b = memberIndex.get(couple.b);
    if (a === undefined || b === undefined) continue;
    partner[a] = b;
    partner[b] = a;
    together[a] = together[b] = couple.alwaysTogether ? 1 : 0;
    coupleId[a] = couple.id;
    coupleId[b] = couple.id;
  }

  const slotIds = new Map<string, number>();
  const day = new Int32Array(S);
  const week = new Int32Array(S);
  const slot = new Int32Array(S);
  const allowMixed = new Uint8Array(S);
  const fixed = new Uint8Array(S);
  const mixedIds = new Set(input.placements.filter((p) => p.allowMixed).map((p) => p.sessionId));
  sessions.forEach((s, i) => {
    day[i] = Number(s.date.slice(8, 10));
    week[i] = Math.min(Math.max(s.weekIndex, 0), 7);
    slot[i] = s.slotId === null ? -1 : (slotIds.get(s.slotId) ?? slotIds.set(s.slotId, slotIds.size).get(s.slotId)!);
    allowMixed[i] = mixedIds.has(s.id) ? 1 : 0;
    fixed[i] = fixedIds.has(s.id) ? 1 : 0;
  });

  const eligible = new Uint8Array(S * M);
  const locationMatch = new Uint8Array(S * M);
  const canServe = new Uint8Array(M);
  sessions.forEach((s, si) => {
    members.forEach((m, mi) => {
      if (isEligible(m, s)) {
        eligible[si * M + mi] = 1;
        canServe[mi] = 1;
      }
      if (m.preferredLocationId === s.locationId) locationMatch[si * M + mi] = 1;
    });
  });

  const pool: number[] = [];
  const poolGroup = new Int32Array(M).fill(-1);
  const groupOf = new Map<string, number>();
  members.forEach((m, i) => {
    if (!canServe[i]) return;
    pool.push(i);
    poolGroup[i] = groupOf.get(m.privilege) ?? groupOf.set(m.privilege, groupOf.size).get(m.privilege)!;
  });

  const pairs = (list: [string, string][]) => {
    const set = new Set<number>();
    for (const [x, y] of list) {
      const a = memberIndex.get(x);
      const b = memberIndex.get(y);
      if (a !== undefined && b !== undefined && a !== b) set.add(key(a, b));
    }
    return set;
  };

  // History: the cost of repeating a pair decays with age; couples never count.
  const window = Math.max(0, input.repeatWindowMonths);
  const byAge = [0, weights.repeat1, weights.repeat2, weights.repeat3];
  const repeatCost = new Map<number, number>();
  const lastTogether = new Map<number, string>();
  const earlier = input.history.filter((h) => h.month < input.month);
  const lastMonth = earlier.reduce<string | null>((latest, h) => (latest === null || h.month > latest ? h.month : latest), null);
  const lastMonthPairs = new Set<number>();
  for (const h of earlier) {
    if (h.isCouple) continue;
    const a = memberIndex.get(h.a);
    const b = memberIndex.get(h.b);
    if (a === undefined || b === undefined || a === b) continue;
    const k = key(a, b);
    if (partner[a] === b) continue;
    const previous = lastTogether.get(k);
    if (!previous || h.month > previous) lastTogether.set(k, h.month);
    if (h.month === lastMonth) lastMonthPairs.add(k);
    const age = monthsBetween(input.month, h.month);
    if (age < 1 || age > window) continue;
    const cost = age < byAge.length ? byAge[age] : weights.repeatOlder;
    if (cost > (repeatCost.get(k) ?? 0)) repeatCost.set(k, cost);
  }

  return {
    input,
    weights,
    M,
    S,
    members,
    memberIndex,
    sessions,
    sessionIndex,
    female,
    limit,
    partner,
    together,
    coupleId,
    day,
    week,
    slot,
    slotCount: slotIds.size,
    locationMatch,
    allowMixed,
    eligible,
    pool,
    poolGroup,
    groups: groupOf.size,
    never: pairs(input.never),
    prefer: pairs(input.prefer),
    repeatCost,
    lastTogether,
    lastMonth,
    lastMonthPairs,
    fixed,
  };
}

/**
 * Hard constraints 4 and 5: the pairing rule (or a couple, or a mixed-pair
 * exception) and never-pairs. Someone in an always-together couple only
 * serves with their partner.
 */
export function pairAllowed(P: Problem, a: number, b: number, s: number): boolean {
  if (a === b) return false;
  if (P.never.has(pairKey(P, a, b))) return false;
  if (P.partner[a] === b) return true;
  if (P.together[a] || P.together[b]) return false;
  return P.female[a] === P.female[b] || P.partner[a] === b || P.allowMixed[s] === 1;
}

/** Two members per session, -1 for an empty place. */
export type Assignment = Int32Array;

export function emptyAssignment(P: Problem): Assignment {
  return new Int32Array(P.S * 2).fill(-1);
}

/** Loads placements (by id) into index form; unknown people are left out. */
export function assignmentFrom(P: Problem, placements: Placement[]): Assignment {
  const A = emptyAssignment(P);
  for (const placement of placements) {
    const s = P.sessionIndex.get(placement.sessionId);
    if (s === undefined) continue;
    const people = placement.memberIds.map((id) => P.memberIndex.get(id)).filter((m): m is number => m !== undefined);
    A[s * 2] = people[0] ?? -1;
    A[s * 2 + 1] = people[1] ?? -1;
  }
  return A;
}

/**
 * Scores a whole month. Lower is better. Used to compare the greedy passes,
 * to judge every local-search move and swap suggestion, and for the summary
 * cards, so the screen's numbers and the engine's choices can't disagree.
 * Buffers are reused between calls because local search calls this
 * thousands of times.
 */
export class Scorer {
  private load: Int32Array;
  private dayCount: Uint8Array;
  private weekCount: Uint8Array;
  private slotUse: Uint8Array;
  private pairUse: Map<number, number> = new Map();

  constructor(private P: Problem) {
    this.load = new Int32Array(P.M);
    this.dayCount = new Uint8Array(P.M * 32);
    this.weekCount = new Uint8Array(P.M * 8);
    this.slotUse = new Uint8Array(P.M * Math.max(P.slotCount, 1));
  }

  score(A: Assignment): ScoreBreakdown {
    const { P } = this;
    const W = P.weights;
    const { load, dayCount, weekCount, slotUse, pairUse } = this;
    load.fill(0);
    dayCount.fill(0);
    weekCount.fill(0);
    slotUse.fill(0);
    pairUse.clear();

    let unfilled = 0;
    let hard = 0;
    let repeats = 0;
    let twice = 0;
    let sameSlot = 0;
    let preferences = 0;

    for (let s = 0; s < P.S; s += 1) {
      const a = A[s * 2];
      const b = A[s * 2 + 1];
      if (a < 0 && b < 0) {
        unfilled += 1;
        continue;
      }
      if (a < 0 || b < 0) unfilled += 0.5;
      for (const m of [a, b]) {
        if (m < 0) continue;
        load[m] += 1;
        dayCount[m * 32 + P.day[s]] += 1;
        weekCount[m * 8 + P.week[s]] += 1;
        if (P.slot[s] >= 0) {
          const k = m * P.slotCount + P.slot[s];
          if (slotUse[k] > 0) sameSlot += 1;
          slotUse[k] += 1;
        }
        if (!P.eligible[s * P.M + m]) hard += 1;
        if (P.locationMatch[s * P.M + m]) preferences += W.preferredLocation;
      }
      if (a >= 0 && b >= 0) {
        if (!pairAllowed(P, a, b, s)) hard += 1;
        if (P.partner[a] !== b) {
          const k = pairKey(P, a, b);
          repeats += P.repeatCost.get(k) ?? 0;
          const used = pairUse.get(k) ?? 0;
          if (used > 0) twice += used;
          pairUse.set(k, used + 1);
          if (P.prefer.has(k)) preferences += W.preferredPair;
        }
      }
    }

    let spread = 0;
    for (let m = 0; m < P.M; m += 1) {
      if (load[m] === 0) continue;
      if (load[m] > P.limit[m]) hard += load[m] - P.limit[m];
      for (let d = 1; d < 32; d += 1) if (dayCount[m * 32 + d] > 1) hard += dayCount[m * 32 + d] - 1;
      for (let w = 0; w < 8; w += 1) {
        const here = weekCount[m * 8 + w];
        if (here > 1) spread += (here - 1) * W.sameWeek;
        if (here > 0 && w < 7 && weekCount[m * 8 + w + 1] > 0) spread += W.consecutiveWeeks;
      }
    }

    // Fairness: squared spread of sessions/limit within each privilege.
    let fairness = 0;
    if (P.groups > 0) {
      const sum = new Float64Array(P.groups);
      const count = new Float64Array(P.groups);
      for (const m of P.pool) {
        sum[P.poolGroup[m]] += load[m] / P.limit[m];
        count[P.poolGroup[m]] += 1;
      }
      for (const m of P.pool) {
        const g = P.poolGroup[m];
        const deviation = load[m] / P.limit[m] - sum[g] / count[g];
        fairness += deviation * deviation;
      }
      fairness *= W.fairness;
    }

    const parts = {
      unfilled: unfilled * W.unfilled,
      hardBreaks: hard * W.hardBreak,
      repeats,
      samePairThisMonth: twice * W.samePairThisMonth,
      fairness,
      spread,
      sameSlot: sameSlot * W.sameSlot,
      preferences,
    };
    const total = parts.unfilled + parts.hardBreaks + parts.repeats + parts.samePairThisMonth + parts.fairness + parts.spread + parts.sameSlot + parts.preferences;
    return { total, ...parts };
  }

  /** Sessions per member after the last `score` call. */
  loads(): Int32Array {
    return this.load;
  }
}
