import type { Privilege } from "@/lib/members/limits";

/**
 * The scheduler's input and output (§8). Plain data, no database: the
 * server loads these, the engine never fetches anything, so every rule can be
 * tested with a few lines of fixtures.
 */

export type AvailabilityMode = "specific" | "flexible" | "ask_monthly";

export interface EngineMember {
  id: string;
  name: string;
  gender: "M" | "F";
  titleConfirmed: boolean;
  privilege: Privilege;
  /** Override, otherwise the privilege's limit. */
  limit: number;
  mode: AvailabilityMode;
  /** The ticked slots, for `specific`. */
  slotIds: string[];
  /** For `ask_monthly`: has confirmed they're available this month. */
  confirmedThisMonth: boolean;
  away: { start: string; end: string }[];
  pausedUntil: string | null;
  active: boolean;
  preferredLocationId: string | null;
}

export interface EngineSession {
  id: string;
  /** Null for an extra session that belongs to no weekly slot. */
  slotId: string | null;
  locationId: string;
  date: string;
  weekIndex: number;
  isCancelled: boolean;
}

export interface EngineCouple {
  id: string;
  a: string;
  b: string;
  /** Only ever placed together, never with someone else. */
  alwaysTogether: boolean;
}

/** Two people who served together, from imported and published months. */
export interface HistoryPair {
  a: string;
  b: string;
  month: string;
  isCouple: boolean;
}

export interface Placement {
  sessionId: string;
  memberIds: string[];
  coupleId: string | null;
  locked: boolean;
  /** "Allow mixed pair here": a Bro with a Sis who aren't a couple. */
  allowMixed: boolean;
  reason?: string | null;
}

/** Flat so it can be stored as settings JSON and tuned from Settings. */
export interface Weights {
  unfilled: number;
  /** Anything breaking a hard rule — only possible through a lock or a hand edit. */
  hardBreak: number;
  repeat1: number;
  repeat2: number;
  repeat3: number;
  /** Inside the repeat window but more than three months ago. */
  repeatOlder: number;
  samePairThisMonth: number;
  fairness: number;
  sameWeek: number;
  consecutiveWeeks: number;
  sameSlot: number;
  /** Negative: a bonus. */
  preferredLocation: number;
  preferredPair: number;
}

export interface SchedulerInput {
  month: string;
  sessions: EngineSession[];
  members: EngineMember[];
  couples: EngineCouple[];
  never: [string, string][];
  prefer: [string, string][];
  history: HistoryPair[];
  repeatWindowMonths: number;
  weights?: Partial<Weights>;
  /**
   * What is already in the month. `generate` keeps the locked ones and
   * replaces the rest; `evaluate` and `suggest` read all of them.
   */
  placements: Placement[];
  seed: number;
  iterations?: number;
}

export interface ScoreBreakdown {
  total: number;
  unfilled: number;
  hardBreaks: number;
  repeats: number;
  samePairThisMonth: number;
  fairness: number;
  spread: number;
  sameSlot: number;
  preferences: number;
}

export type Issue =
  | { kind: "unfilled"; sessionId: string }
  | { kind: "half_filled"; sessionId: string }
  | { kind: "over_limit"; memberId: string; count: number; limit: number }
  | { kind: "same_day"; memberId: string; date: string; sessionIds: string[] }
  | { kind: "unavailable"; memberId: string; sessionId: string }
  | { kind: "mixed_pair"; sessionId: string }
  | { kind: "never_pair"; sessionId: string }
  | { kind: "repeat_last_month"; sessionId: string; month: string }
  | { kind: "twice_this_month"; sessionId: string }
  | { kind: "specific_unused"; memberId: string }
  | { kind: "title_unconfirmed"; memberIds: string[] };

export type Badge = "repeat" | "same_day" | "couple" | "twice" | "over_limit" | "unavailable" | "mixed" | "never";

export interface Evaluation {
  score: ScoreBreakdown;
  issues: Issue[];
  /** Per session id. */
  badges: Record<string, Badge[]>;
  loads: { memberId: string; count: number; limit: number }[];
  /** "34 of 43 pairs repeated from Sep": per session, couples left out. */
  repeats: { lastMonth: string | null; repeated: number; pairs: number };
  /** People-places needed vs what the limits allow. */
  capacity: { needed: number; available: number };
}

export interface GenerateResult {
  placements: Placement[];
  evaluation: Evaluation;
  seed: number;
  iterations: number;
  ms: number;
}

export interface Suggestion {
  /** Who goes in. */
  memberIds: string[];
  /** Who comes out (empty when filling a gap). */
  replaces: string[];
  /** Change in total score; lower is better. */
  delta: number;
  reason: string;
}
