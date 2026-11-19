import { describe, expect, it } from "vitest";

import { buildIcs, escapeText, fold, googleCalendarLink, type CalendarEvent } from "./index";

const event: CalendarEvent = {
  uid: "3f1c2b6e-0000-4000-8000-000000000001@pw-scheduler",
  date: "2026-12-05",
  startTime: "10:00:00",
  endTime: "12:00:00",
  title: "Public witnessing – Police Station – Westlands",
  location: "Police Station – Westlands",
  description: "With Sis Beauty Odjo, Sis Bernice Sakyi; moved for National Sanitation Day\nSee you there",
  updatedAt: new Date("2026-11-19T09:30:00Z"),
};

describe("Google Calendar link", () => {
  it("uses Accra local times and the event's details", () => {
    const url = new URL(googleCalendarLink(event));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261205T100000/20261205T120000");
    expect(url.searchParams.get("ctz")).toBe("Africa/Accra");
    expect(url.searchParams.get("text")).toBe(event.title);
  });
});

describe("ICS (RFC 5545 basics)", () => {
  const ics = buildIcs([event, { ...event, uid: "second@pw-scheduler", cancelled: true }], { name: "Public witnessing – Sis Julia Eshun", now: new Date("2026-11-19T10:00:00Z") });
  const lines = ics.split("\r\n");

  it("uses CRLF line endings and ends with one", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("keeps every line within 75 octets", () => {
    for (const line of lines) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("has the required properties and balanced components", () => {
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\nPRODID:/);
    for (const name of ["VCALENDAR", "VEVENT", "VALARM"]) {
      expect(unfolded.split(`BEGIN:${name}`).length).toBe(unfolded.split(`END:${name}`).length);
    }
    expect(unfolded).toContain("UID:3f1c2b6e-0000-4000-8000-000000000001@pw-scheduler");
    expect(unfolded).toContain("DTSTAMP:20261119T100000Z");
    expect(unfolded).toContain("DTSTART:20261205T100000Z");
    expect(unfolded).toContain("DTEND:20261205T120000Z");
    expect(unfolded).toContain("STATUS:CANCELLED");
  });

  it("escapes commas, semicolons, backslashes and line breaks", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:With Sis Beauty Odjo\\, Sis Bernice Sakyi\; moved for National Sanitation Day\\nSee you there");
  });

  it("folds without splitting a character", () => {
    const long = `SUMMARY:${"–".repeat(40)}`;
    const folded = fold(long);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
  });
});
