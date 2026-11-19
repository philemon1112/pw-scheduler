import { shortDate } from "@/lib/dates/calendar";
import { formatTime } from "@/lib/dates/time";
import type { Issue } from "@/lib/scheduler/types";

import type { ViewSession } from "./month-view";

export interface IssueLine {
  tone: "danger" | "warning" | "info";
  text: string;
  /** The session to open when the line is clicked. */
  sessionId: string | null;
}

/** Issues that only mean something for a month still being built. */
const BUILD_ONLY = new Set<Issue["kind"]>(["unfilled", "half_filled", "over_limit", "unavailable", "specific_unused", "title_unconfirmed", "repeat_last_month"]);

/**
 * The warnings list (§8) in plain sentences with names, most serious first.
 * Repeats from last month are left to the summary card and the cell badges —
 * listing 34 of them would bury everything else. For a past month only what
 * actually happened is listed (two sessions in a day, a pair twice), not
 * today's limits or availability.
 */
export function describeIssues(
  issues: Issue[],
  names: Map<string, string>,
  sessions: Map<string, ViewSession & { locationName: string }>,
  past: boolean
): IssueLine[] {
  const name = (id: string) => names.get(id) ?? "Someone no longer listed";
  const where = (id: string) => {
    const s = sessions.get(id);
    return s ? `${shortDate(s.date)} · ${formatTime(s.startTime)} · ${s.locationName.split(/\s[–-]\s/)[0]}` : "A session";
  };
  const pairOf = (id: string) => sessions.get(id)?.people?.map((p) => p.name).join(" & ") ?? "That pair";

  const lines: IssueLine[] = [];
  for (const issue of issues) {
    if (past && BUILD_ONLY.has(issue.kind)) continue;
    switch (issue.kind) {
      case "same_day":
        lines.push({ tone: "danger", text: `${name(issue.memberId)} is in ${issue.sessionIds.length} sessions on ${shortDate(issue.date)}`, sessionId: issue.sessionIds[0] });
        break;
      case "over_limit":
        lines.push({ tone: "danger", text: `${name(issue.memberId)} has ${issue.count} sessions; their limit is ${issue.limit}`, sessionId: null });
        break;
      case "unavailable":
        lines.push({ tone: "danger", text: `${name(issue.memberId)} isn't available for ${where(issue.sessionId)}`, sessionId: issue.sessionId });
        break;
      case "never_pair":
        lines.push({ tone: "danger", text: `${pairOf(issue.sessionId)} are set to be kept apart (${where(issue.sessionId)})`, sessionId: issue.sessionId });
        break;
      case "mixed_pair":
        lines.push({ tone: "warning", text: `${pairOf(issue.sessionId)} are a mixed pair without "Allow mixed pair" (${where(issue.sessionId)})`, sessionId: issue.sessionId });
        break;
      case "unfilled":
        lines.push({ tone: "warning", text: `${where(issue.sessionId)} has nobody yet`, sessionId: issue.sessionId });
        break;
      case "half_filled":
        lines.push({ tone: "warning", text: `${where(issue.sessionId)} needs a second person`, sessionId: issue.sessionId });
        break;
      case "twice_this_month":
        lines.push({ tone: "warning", text: `${pairOf(issue.sessionId)} are together twice this month (${where(issue.sessionId)})`, sessionId: issue.sessionId });
        break;
      case "specific_unused":
        lines.push({ tone: "info", text: `${name(issue.memberId)} wasn't used — none of their ticked slots had room`, sessionId: null });
        break;
      case "title_unconfirmed":
        lines.push({
          tone: "info",
          text: `${issue.memberIds.length === 1 ? `${name(issue.memberIds[0])}'s title isn't` : `${issue.memberIds.length} people's titles aren't`} confirmed yet. Pairs depend on Bro and Sis, so check them in Members.`,
          sessionId: null,
        });
        break;
      case "repeat_last_month":
        break;
    }
  }
  const order = { danger: 0, warning: 1, info: 2 };
  return lines.sort((a, b) => order[a.tone] - order[b.tone]);
}
