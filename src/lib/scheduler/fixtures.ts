import type { EngineMember, EngineSession, SchedulerInput } from "./types";

/** Test fixtures: a member with sensible defaults. */
export function member(id: string, gender: "M" | "F", extra: Partial<EngineMember> = {}): EngineMember {
  return {
    id,
    name: `${id} Mensah`,
    gender,
    titleConfirmed: true,
    privilege: "publisher",
    limit: 2,
    mode: "flexible",
    slotIds: [],
    confirmedThisMonth: false,
    away: [],
    pausedUntil: null,
    active: true,
    preferredLocationId: null,
    ...extra,
  };
}

export function session(id: string, date: string, extra: Partial<EngineSession> = {}): EngineSession {
  return { id, slotId: `slot-${id.split("@")[0]}`, locationId: "police", date, weekIndex: Math.ceil(Number(date.slice(8)) / 7), isCancelled: false, ...extra };
}

export function input(extra: Partial<SchedulerInput>): SchedulerInput {
  return { month: "2026-12", sessions: [], members: [], couples: [], never: [], prefer: [], history: [], repeatWindowMonths: 3, placements: [], seed: 1, iterations: 40, ...extra };
}

/**
 * A month shaped like the real one: `slots` weekly slots at two places over
 * four or five weeks, and a mixed crowd of members.
 */
export function bigMonth(sessionsWanted: number, membersWanted: number, seed = 7): SchedulerInput {
  let x = seed;
  const rand = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const weekdays = [1, 4, 5, 6]; // Tue, Fri, Sat, Sun offsets from Mon 30 Nov
  const slotsPerWeek = Math.ceil(sessionsWanted / 4);
  const sessions: EngineSession[] = [];
  for (let w = 0; w < 5 && sessions.length < sessionsWanted; w += 1) {
    for (let k = 0; k < slotsPerWeek && sessions.length < sessionsWanted; k += 1) {
      const day = 1 + w * 7 + weekdays[k % weekdays.length];
      if (day > 31) continue;
      const date = `2026-12-${String(day).padStart(2, "0")}`;
      sessions.push({ id: `s${k}@${date}`, slotId: `slot${k}`, locationId: k % 2 ? "mtn" : "police", date, weekIndex: w + 1, isCancelled: false });
    }
  }
  const members: EngineMember[] = Array.from({ length: membersWanted }, (_, i) => {
    const r = rand();
    return member(`m${i}`, i % 2 ? "F" : "M", {
      limit: r < 0.6 ? 2 : r < 0.85 ? 4 : 6,
      privilege: r < 0.6 ? "publisher" : r < 0.85 ? "auxiliary_pioneer" : "regular_pioneer",
      mode: rand() < 0.25 ? "specific" : "flexible",
      slotIds: [`slot${Math.floor(rand() * slotsPerWeek)}`, `slot${Math.floor(rand() * slotsPerWeek)}`],
      away: rand() < 0.15 ? [{ start: "2026-12-10", end: "2026-12-16" }] : [],
    });
  });
  const couples = [
    { id: "c1", a: "m0", b: "m1", alwaysTogether: true },
    { id: "c2", a: "m2", b: "m3", alwaysTogether: true },
  ];
  return input({ sessions, members, couples, never: [["m4", "m6"]], seed, iterations: 300 });
}
