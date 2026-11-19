import { addDays, weekdayIndex, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";

/** A session as the messages see it: real names, titles and the couple's label. */
export interface MessageSession {
  id: string;
  /** The assignment, for calendar links; null when nobody is placed. */
  assignmentId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationId: string;
  isCancelled: boolean;
  people: MessagePerson[];
  /** "Bro & Sis Agbanawo" when the pair is a couple. */
  coupleLabel: string | null;
  specialDayName: string | null;
  /** The special day's note for messages. */
  messageNote: string | null;
}

export interface MessagePerson {
  id: string;
  title: "Bro" | "Sis";
  name: string;
  phoneE164: string | null;
}

export interface MessageLocation {
  id: string;
  messageName: string;
}

export const titled = (p: Pick<MessagePerson, "title" | "name">) => `${p.title} ${p.name}`;

/** "Bro Philemon Abakah & Bro Henry Atsu Damey", or the couple's label. */
export function partnersOf(session: Pick<MessageSession, "people" | "coupleLabel">): string {
  if (session.coupleLabel && session.people.length === 2) return session.coupleLabel;
  if (session.people.length === 0) return "To be confirmed";
  const names = session.people.map(titled);
  return names.length === 1 ? `${names[0]} & (to be confirmed)` : names.join(" & ");
}

/** The Friday of the weekend to message: this one from Friday to Sunday, otherwise the next. */
export const weekendFriday = (today: string): string => addDays(today, 4 - weekdayIndex(today));

/**
 * The weekend group message's body (§12, the Thursday message): for each
 * location with sessions, an intro, the days in order with each session's
 * time and partners, any special-day note, and the closing lines. Days
 * without sessions are left out, as are cancelled sessions; a moved session
 * shows its new time.
 */
export function weekendBlocks(locations: MessageLocation[], sessions: MessageSession[]): string {
  const blocks: string[] = [];
  for (const location of locations) {
    const block = weekendBlock(location, sessions, blocks.length === 0);
    if (block) blocks.push(block);
  }
  return blocks.join("\n\n");
}

/**
 * One location's part of the weekend message, or null when it has no
 * sessions that weekend. `first` chooses "Please find" over "Also, find" —
 * a location sent as its own message is always first.
 */
export function weekendBlock(location: MessageLocation, sessions: MessageSession[], first = true): string | null {
  const mine = sessions.filter((s) => s.locationId === location.id).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const live = mine.filter((s) => !s.isCancelled);
  if (live.length === 0) return null;

  const intro = `${first ? "Please find" : "Also, find"} below the public witnessing schedule from *Friday to Sunday* at the location near the *${location.messageName}*.`;
  const days: string[] = [];
  for (const date of [...new Set(live.map((s) => s.date))]) {
    const lines = live
      .filter((s) => s.date === date)
      .map((s) => `*Time:* ${formatTimeRange(s.startTime, s.endTime)}\n*Partners:* ${partnersOf(s)}`);
    days.push(`*${WEEKDAY_NAMES[weekdayOf(date)]}*\n${lines.join("\n\n")}`);
  }
  const notes = [...new Set(mine.filter((s) => s.messageNote && (s.isCancelled || s.specialDayName)).map((s) => s.messageNote!))];
  const parts = [intro, days.join("\n\n")];
  if (notes.length) parts.push(notes.map((n) => `*Note:* ${n}`).join("\n"));
  parts.push("Kindly indicate your availability for any of the sessions here or via direct message. Kindly communicate if you would like to be rescheduled.\nThank you");
  return parts.join("\n\n");
}

const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One person's sessions for the monthly preview: "• Sat 7 Nov · 6:30 – 8:30 am with Sis Beauty Odjo at Police Station – Westlands". */
export function mySessions(memberId: string, sessions: MessageSession[], locations: Map<string, MessageLocation>): string {
  return sessions
    .filter((s) => !s.isCancelled && s.people.some((p) => p.id === memberId))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((s) => {
      const others = s.people.filter((p) => p.id !== memberId);
      const partner = others.length ? ` with ${others.map(titled).join(" & ")}` : " (partner to be confirmed)";
      return `• ${shortDay(s.date)} · ${formatTimeRange(s.startTime, s.endTime)}${partner} at ${locations.get(s.locationId)?.messageName ?? ""}`;
    })
    .join("\n");
}

/** WhatsApp: to one number, or with no number so you can choose a chat or group. */
export function whatsappLink(text: string, phoneE164?: string | null): string {
  const digits = phoneE164?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
