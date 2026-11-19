import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { loadMessageSessions, loadTemplates, messageLocations, type StoredMonth } from "@/db/messages-data";
import { members, messageLog, schedules } from "@/db/schema";
import { addDays, daysInMonth, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";
import { dayMonth, mySessions, partnersOf, titled, weekendBlocks, type MessageLocation } from "@/lib/messages/compose";
import { fill, greetingAt, type MessageKind } from "@/lib/messages/templates";
import { displayPhone } from "@/lib/members/phone";
import { memberUrl, openToken } from "@/lib/tokens";

export interface Recipient {
  memberId: string;
  name: string;
  phone: string | null;
  phoneLabel: string | null;
  text: string;
  sent: boolean;
}

export interface PairMessage {
  sessionId: string;
  when: string;
  location: string;
  partners: string;
  recipients: Recipient[];
}

export interface WeekendData {
  friday: string;
  sunday: string;
  text: string;
  months: StoredMonth[];
  locations: MessageLocation[];
  sessionCount: number;
  lastSent: Date | null;
  pairs: PairMessage[];
}

/** Each member's link, if one can be shown. */
async function linksFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db().select({ id: members.id, enc: members.publicTokenEnc }).from(members).where(inArray(members.id, ids));
  const out = new Map<string, string>();
  for (const r of rows) {
    const token = openToken(r.enc);
    if (token) out.set(r.id, token);
  }
  return out;
}

/** The latest log entry per member for one kind, scoped to a schedule or a weekend. */
async function latestStatus(kind: MessageKind, scope: { scheduleId?: string; weekStart?: string }) {
  const rows = await db()
    .select({ memberId: messageLog.memberId, status: messageLog.status, sentAt: messageLog.sentAt })
    .from(messageLog)
    .where(and(eq(messageLog.kind, kind), scope.scheduleId ? eq(messageLog.scheduleId, scope.scheduleId) : eq(messageLog.weekStart, scope.weekStart!)))
    .orderBy(desc(messageLog.sentAt));
  const out = new Map<string | null, { status: "sent" | "change_requested"; sentAt: Date }>();
  for (const r of rows) if (!out.has(r.memberId)) out.set(r.memberId, { status: r.status, sentAt: r.sentAt });
  return out;
}

export async function getWeekendData(friday: string, now = new Date()): Promise<WeekendData> {
  const sunday = addDays(friday, 2);
  const [{ sessions, months }, locations, templates, log, pairLog] = await Promise.all([
    loadMessageSessions(db(), friday, sunday),
    messageLocations(db()),
    loadTemplates(db()),
    latestStatus("weekend_group", { weekStart: friday }),
    latestStatus("pair_reminder", { weekStart: friday }),
  ]);
  const greeting = greetingAt(now);
  const blocks = weekendBlocks(locations, sessions);
  const names = new Map(locations.map((l) => [l.id, l.messageName]));
  const live = sessions.filter((s) => !s.isCancelled && s.people.length > 0);
  const links = await linksFor([...new Set(live.flatMap((s) => s.people.map((p) => p.id)))]);

  const pairs: PairMessage[] = live.map((s) => ({
    sessionId: s.id,
    when: `${WEEKDAY_NAMES[weekdayOf(s.date)].slice(0, 3)} ${dayMonth(s.date)} · ${formatTimeRange(s.startTime, s.endTime)}`,
    location: names.get(s.locationId) ?? "",
    partners: partnersOf(s),
    recipients: s.people.map((p) => {
      const others = s.people.filter((o) => o.id !== p.id);
      const token = links.get(p.id);
      return {
        memberId: p.id,
        name: titled(p),
        phone: p.phoneE164,
        phoneLabel: p.phoneE164 ? displayPhone(p.phoneE164) : null,
        sent: pairLog.get(p.id)?.status === "sent",
        text: fill(templates.pair_reminder, {
          greeting,
          name: titled(p),
          title: p.title,
          partner: others.length ? others.map(titled).join(" & ") : "a partner to be confirmed",
          date: dayMonth(s.date),
          day: WEEKDAY_NAMES[weekdayOf(s.date)],
          time: formatTimeRange(s.startTime, s.endTime),
          location: names.get(s.locationId) ?? "",
          calendar_link: token ? memberUrl(token) : "",
          availability_link: token ? memberUrl(token, "/availability") : "",
        }),
      };
    }),
  }));

  return {
    friday,
    sunday,
    text: blocks ? fill(templates.weekend_group, { greeting, weekend_blocks: blocks }) : "",
    months,
    locations,
    sessionCount: sessions.filter((s) => !s.isCancelled).length,
    lastSent: log.get(null)?.sentAt ?? null,
    pairs,
  };
}

export interface PreviewRow {
  memberId: string;
  name: string;
  phone: string | null;
  phoneLabel: string | null;
  sessions: number;
  hasLink: boolean;
  text: string;
  status: "not_sent" | "sent" | "change_requested";
}

export interface MonthlyData {
  month: string;
  status: StoredMonth["status"] | null;
  rows: PreviewRow[];
}

export async function getMonthlyData(month: string, monthName: string): Promise<MonthlyData> {
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  const [[schedule], { sessions }, locations, templates] = await Promise.all([
    db().select({ id: schedules.id, status: schedules.status }).from(schedules).where(eq(schedules.month, month)).limit(1),
    loadMessageSessions(db(), from, to),
    messageLocations(db()),
    loadTemplates(db()),
  ]);
  if (!schedule) return { month, status: null, rows: [] };

  const log = await latestStatus("monthly_preview", { scheduleId: schedule.id });
  const people = new Map(sessions.filter((s) => !s.isCancelled).flatMap((s) => s.people).map((p) => [p.id, p]));
  const links = await linksFor([...people.keys()]);
  const byId = new Map(locations.map((l) => [l.id, l]));

  const rows: PreviewRow[] = [...people.values()].map((p) => {
    const token = links.get(p.id);
    const lines = mySessions(p.id, sessions, byId);
    return {
      memberId: p.id,
      name: titled(p),
      phone: p.phoneE164,
      phoneLabel: p.phoneE164 ? displayPhone(p.phoneE164) : null,
      sessions: lines ? lines.split("\n").length : 0,
      hasLink: Boolean(token),
      status: log.get(p.id)?.status ?? "not_sent",
      text: fill(templates.monthly_preview, {
        greeting: greetingAt(new Date()),
        name: titled(p),
        title: p.title,
        month: monthName,
        my_sessions: lines,
        calendar_link: token ? memberUrl(token) : "(link not made yet)",
        availability_link: token ? memberUrl(token, "/availability") : "(link not made yet)",
      }),
    };
  });
  rows.sort((a, b) => a.name.replace(/^(Bro|Sis) /, "").localeCompare(b.name.replace(/^(Bro|Sis) /, "")));
  return { month, status: schedule.status, rows };
}

export async function getTemplates() {
  return loadTemplates(db());
}
