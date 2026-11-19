import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { planSeed } from "@/lib/import/seed-plan";
import { mySessions, weekendBlock, weekendBlocks, weekendFriday, whatsappLink } from "@/lib/messages/compose";
import { DEFAULT_TEMPLATES, fill, greetingAt } from "@/lib/messages/templates";
import { testDb } from "@/test/pglite";

import { loadMessageSessions, loadTemplates, messageLocations } from "./messages-data";
import { applySeed } from "./seed-apply";

const raw = JSON.parse(readFileSync(new URL("../../seed/pw-history-2026.json", import.meta.url), "utf8"));

const CLOSING = "Kindly indicate your availability for any of the sessions here or via direct message. Kindly communicate if you would like to be rescheduled.\nThank you";

/** §12's example, with the names as the seed stores them (the example was typed by hand). */
const EXPECTED = `Good Afternoon @all
Please find below the public witnessing schedule from *Friday to Sunday* at the location near the *Haatso - near MTN office*.

*Friday*
*Time:* 6:00 – 8:00 am
*Partners:* Bro Philemon Abakah & Bro Henry Atsu Damey

*Saturday*
*Time:* 6:00 – 8:00 am
*Partners:* Sis Julia Eshun & Sis Comfort Owusua

*Time:* 9:30 – 11:30 am
*Partners:* Bro Arnold Boateng & Bro Philip Abakah

*Sunday*
*Time:* 6:30 – 8:30 am
*Partners:* Bro Philip Abakah & Bro Kofi Adusei

*Time:* 9:30 – 11:30 am
*Partners:* Bro Jerome Masamaka & Bro Elvis Ampomah-Tabi

${CLOSING}

Also, find below the public witnessing schedule from *Friday to Sunday* at the location near the *Police Station – Westlands*.

*Friday*
*Time:* 6:00 – 8:00 am
*Partners:* Sis Comfort Owusua & Sis Lydia Mensah

*Time:* 8:00 – 10:00 am
*Partners:* Sis Beauty Odjo & Sis Lily Owusu Mensah

*Time:* 4:00 – 6:00 pm
*Partners:* Sis Asantewaa Bittermann & Sis Bernice Sakyi

*Saturday*
*Time:* 6:30 – 8:30 am
*Partners:* Bro Jerry Bobby & Bro George Dautey

*Time:* 9:30 – 11:30 am
*Partners:* Bro & Sis Djansi-Duose

*Sunday*
*Time:* 4:00 – 6:00 pm
*Partners:* Bro & Sis Agbanawo

${CLOSING}`;

async function seeded() {
  const { db } = await testDb();
  await applySeed(db, planSeed(raw), raw);
  return db;
}

describe("the weekend group message", () => {
  it("renders November Week 2 (Fri 13 – Sun 15 Nov) exactly in the Thursday message's format", async () => {
    const db = await seeded();
    const friday = weekendFriday("2026-11-12");
    expect(friday).toBe("2026-11-13");
    const [{ sessions }, locations, templates] = await Promise.all([loadMessageSessions(db, friday, "2026-11-15"), messageLocations(db), loadTemplates(db)]);
    const text = fill(templates.weekend_group, { greeting: greetingAt(new Date("2026-11-12T14:00:00Z")), weekend_blocks: weekendBlocks(locations, sessions) });
    expect(text).toBe(EXPECTED);
  });

  it("splits into one complete message per location, each opening with “Please find”", async () => {
    const db = await seeded();
    const [{ sessions }, locations, templates] = await Promise.all([loadMessageSessions(db, "2026-11-13", "2026-11-15"), messageLocations(db), loadTemplates(db)]);
    const greeting = greetingAt(new Date("2026-11-12T14:00:00Z"));
    const [mtn, police] = locations.map((l) => fill(templates.weekend_group, { greeting, weekend_blocks: weekendBlock(l, sessions, true)! }));
    const [mtnPart, policePart] = EXPECTED.split("\n\nAlso, find below");
    expect(mtn).toBe(mtnPart);
    expect(police).toBe(`Good Afternoon @all\nPlease find below${policePart}`);
    expect(weekendBlock({ id: "nowhere", messageName: "Nowhere" }, sessions)).toBeNull();
  });

  it("leaves out cancelled sessions, shows the moved time, and adds the special day's note", () => {
    const location = { id: "mtn", messageName: "Haatso - near MTN office" };
    const base = { assignmentId: "a", locationId: "mtn", coupleLabel: null, isCancelled: false, specialDayName: null, messageNote: null };
    const people = [
      { id: "1", title: "Bro" as const, name: "Arnold Boateng", phoneE164: null },
      { id: "2", title: "Bro" as const, name: "Philip Abakah", phoneE164: null },
    ];
    const note = "Saturday morning sessions are adjusted for National Sanitation Day, which ends at 10:00 am.";
    const text = weekendBlocks(
      [location],
      [
        { ...base, id: "x", date: "2026-12-05", startTime: "06:00", endTime: "08:00", isCancelled: true, people: [], specialDayName: "National Sanitation Day", messageNote: note },
        { ...base, id: "y", date: "2026-12-05", startTime: "10:00", endTime: "12:00", people, specialDayName: "National Sanitation Day", messageNote: note },
      ]
    );
    expect(text).toBe(
      `Please find below the public witnessing schedule from *Friday to Sunday* at the location near the *Haatso - near MTN office*.\n\n*Saturday*\n*Time:* 10:00 am – 12:00 pm\n*Partners:* Bro Arnold Boateng & Bro Philip Abakah\n\n*Note:* ${note}\n\n${CLOSING}`
    );
  });

  it("greets by the time of day in Accra", () => {
    expect(greetingAt(new Date("2026-11-12T08:00:00Z"))).toBe("Good Morning");
    expect(greetingAt(new Date("2026-11-12T12:00:00Z"))).toBe("Good Afternoon");
    expect(greetingAt(new Date("2026-11-12T16:59:00Z"))).toBe("Good Afternoon");
    expect(greetingAt(new Date("2026-11-12T17:00:00Z"))).toBe("Good Evening");
  });

  it("picks this weekend from Friday to Sunday, otherwise the next", () => {
    expect(weekendFriday("2026-11-09")).toBe("2026-11-13");
    expect(weekendFriday("2026-11-13")).toBe("2026-11-13");
    expect(weekendFriday("2026-11-15")).toBe("2026-11-13");
    expect(weekendFriday("2026-11-16")).toBe("2026-11-20");
  });
});

describe("the monthly preview", () => {
  it("lists one person's sessions with their partners, in Lemon's wording", async () => {
    const db = await seeded();
    const [{ sessions }, locations] = await Promise.all([loadMessageSessions(db, "2026-11-01", "2026-11-30"), messageLocations(db)]);
    const julia = sessions.flatMap((s) => s.people).find((p) => p.name === "Julia Eshun")!;
    const lines = mySessions(julia.id, sessions, new Map(locations.map((l) => [l.id, l])));
    expect(lines.split("\n")[0]).toBe("• Tue 3 Nov · 4:00 – 6:00 pm with Sis Asantewaa Bittermann at Police Station – Westlands");
    expect(lines.split("\n")).toHaveLength(5);
    const text = fill(DEFAULT_TEMPLATES.monthly_preview, { month: "November 2026", my_sessions: lines, calendar_link: "https://example.org/m/x" });
    expect(text.startsWith("Please this is the schedule for the Public Witnessing for November 2026. You are booked for:\n• Tue 3 Nov")).toBe(true);
    expect(text.endsWith("Add to your calendar: https://example.org/m/x\nKindly let me know if it works for you. Thanks")).toBe(true);
  });

  it("opens WhatsApp to one number, or lets you choose the chat", () => {
    expect(whatsappLink("Hi *all*", "+233 24 123 4567")).toBe("https://wa.me/233241234567?text=Hi%20*all*");
    expect(whatsappLink("a & b")).toBe("https://wa.me/?text=a%20%26%20b");
  });

  it("leaves an unknown placeholder visible", () => {
    expect(fill("Hello {name} {nmae}", { name: "Bro A" })).toBe("Hello Bro A {nmae}");
  });
});
