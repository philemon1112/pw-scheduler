/**
 * Calendar files and links (§13). Accra is UTC+0 all year with no daylight
 * saving, so a session's local time *is* its UTC time; the ICS uses UTC
 * ("Z") times and needs no VTIMEZONE. Written by hand: RFC 5545 is small for
 * what this needs.
 */

export interface CalendarEvent {
  /** Stable across edits, so a subscribed calendar updates the event rather than duplicating it. */
  uid: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string;
  description: string;
  /** When it last changed, for LAST-MODIFIED and SEQUENCE. */
  updatedAt: Date;
  cancelled?: boolean;
}

const compact = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.slice(0, 5).replace(":", "")}00`;
const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Google Calendar's "add event" link, in Accra time. */
export function googleCalendarLink(event: Pick<CalendarEvent, "date" | "startTime" | "endTime" | "title" | "location" | "description">): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${compact(event.date, event.startTime)}/${compact(event.date, event.endTime)}`,
    ctz: "Africa/Accra",
    details: event.description,
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** TEXT escaping (RFC 5545 §3.3.11). */
export const escapeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line at 75 octets, continuing with CRLF + space, without splitting a UTF-8 character. */
export function fold(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const n = bytes.encode(char).length;
    const max = parts.length === 0 ? 75 : 74;
    if (size + n > max) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** A VCALENDAR with one VEVENT per session. */
export function buildIcs(events: CalendarEvent[], options: { name: string; now?: Date }): string {
  const now = utcStamp(options.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PW Scheduler//Public witnessing//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
    "X-WR-TIMEZONE:Africa/Accra",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${compact(e.date, e.startTime)}Z`,
      `DTEND:${compact(e.date, e.endTime)}Z`,
      `SUMMARY:${escapeText(e.title)}`,
      `LOCATION:${escapeText(e.location)}`,
      `DESCRIPTION:${escapeText(e.description)}`,
      `LAST-MODIFIED:${utcStamp(e.updatedAt)}`,
      `SEQUENCE:${Math.floor(e.updatedAt.getTime() / 1000) % 2147483647}`,
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "TRANSP:OPAQUE",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(e.title)}`,
      "TRIGGER:-PT12H",
      "END:VALARM",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
