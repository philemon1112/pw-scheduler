import { assignmentFrom, buildProblem, pairAllowed, pairKey, Scorer, type Assignment, type Problem } from "./problem";
import type { Badge, Evaluation, Issue, SchedulerInput } from "./types";

/**
 * Everything the builder shows about a month: the score, the warnings
 * (§8), a badge list per cell, sessions per person, the repeated-pairs
 * figure and whether the limits can cover the month. Works on any month —
 * generated, edited by hand, or imported — so the same checks that find
 * Davida twice on Fri 27 Nov flag a clash made by dragging a cell.
 */
export function evaluate(input: SchedulerInput): Evaluation {
  const P = buildProblem(input);
  return evaluateAssignment(P, assignmentFrom(P, input.placements));
}

export function evaluateAssignment(P: Problem, A: Assignment): Evaluation {
  const scorer = new Scorer(P);
  const score = scorer.score(A);
  const loads = scorer.loads().slice();

  const issues: Issue[] = [];
  const badges: Record<string, Badge[]> = {};
  const badge = (s: number, b: Badge) => {
    const list = (badges[P.sessions[s].id] ??= []);
    if (!list.includes(b)) list.push(b);
  };

  const pairCount = new Map<number, number>();
  const sessionsOf: number[][] = Array.from({ length: P.M }, () => []);
  let pairs = 0;
  let repeated = 0;

  for (let s = 0; s < P.S; s += 1) {
    const id = P.sessions[s].id;
    const a = A[s * 2];
    const b = A[s * 2 + 1];
    if (a < 0 && b < 0) {
      issues.push({ kind: "unfilled", sessionId: id });
      continue;
    }
    if (a < 0 || b < 0) issues.push({ kind: "half_filled", sessionId: id });
    for (const m of [a, b]) {
      if (m < 0) continue;
      sessionsOf[m].push(s);
      if (!P.eligible[s * P.M + m]) {
        issues.push({ kind: "unavailable", memberId: P.members[m].id, sessionId: id });
        badge(s, "unavailable");
      }
    }
    if (a < 0 || b < 0) continue;

    const couple = P.partner[a] === b;
    if (couple) {
      badge(s, "couple");
      continue;
    }
    const k = pairKey(P, a, b);
    if (P.never.has(k)) {
      issues.push({ kind: "never_pair", sessionId: id });
      badge(s, "never");
    } else if (!pairAllowed(P, a, b, s)) {
      issues.push({ kind: "mixed_pair", sessionId: id });
      badge(s, "mixed");
    }
    pairs += 1;
    if (P.lastMonthPairs.has(k)) {
      repeated += 1;
      badge(s, "repeat");
      issues.push({ kind: "repeat_last_month", sessionId: id, month: P.lastMonth! });
    }
    const seen = pairCount.get(k) ?? 0;
    if (seen > 0) {
      badge(s, "twice");
      issues.push({ kind: "twice_this_month", sessionId: id });
    }
    pairCount.set(k, seen + 1);
  }

  for (let m = 0; m < P.M; m += 1) {
    const mine = sessionsOf[m];
    if (mine.length > P.limit[m] && mine.length > 0) {
      issues.push({ kind: "over_limit", memberId: P.members[m].id, count: mine.length, limit: P.limit[m] });
      for (const s of mine) badge(s, "over_limit");
    }
    const byDay = new Map<number, number[]>();
    for (const s of mine) byDay.set(P.day[s], [...(byDay.get(P.day[s]) ?? []), s]);
    for (const list of byDay.values()) {
      if (list.length < 2) continue;
      issues.push({ kind: "same_day", memberId: P.members[m].id, date: P.sessions[list[0]].date, sessionIds: list.map((s) => P.sessions[s].id) });
      for (const s of list) badge(s, "same_day");
    }
  }

  for (const m of P.pool) {
    if (P.members[m].mode === "specific" && loads[m] === 0) issues.push({ kind: "specific_unused", memberId: P.members[m].id });
  }
  const unconfirmed = P.members.filter((member, m) => loads[m] > 0 && !member.titleConfirmed).map((member) => member.id);
  if (unconfirmed.length > 0) issues.push({ kind: "title_unconfirmed", memberIds: unconfirmed });

  // How many places the limits allow: each person's limit, capped by the
  // number of different days they could serve on.
  let available = 0;
  for (const m of P.pool) {
    const days = new Set<number>();
    for (let s = 0; s < P.S; s += 1) if (P.eligible[s * P.M + m]) days.add(P.day[s]);
    available += Math.min(P.limit[m], days.size);
  }

  const shown = new Set<number>(P.pool);
  for (let m = 0; m < P.M; m += 1) if (loads[m] > 0) shown.add(m);

  return {
    score,
    issues,
    badges,
    loads: [...shown].map((m) => ({ memberId: P.members[m].id, count: loads[m], limit: P.limit[m] })),
    repeats: { lastMonth: P.lastMonth, repeated, pairs },
    capacity: { needed: P.S * 2, available },
  };
}
