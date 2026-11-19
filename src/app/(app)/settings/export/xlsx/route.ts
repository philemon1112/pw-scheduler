import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { assignments, locations, members, schedules, sessions } from "@/db/schema";
import { currentUser } from "@/lib/auth/session";
import { hasRole } from "@/lib/auth/roles";
import { todayInAccra, WEEKDAY_NAMES, weekdayOf } from "@/lib/dates/calendar";
import { formatTimeRange } from "@/lib/dates/time";

/** "Export everything" as a spreadsheet: the members, and every session with who served. */
export async function GET() {
  const user = await currentUser();
  if (!user || !hasRole(user, "owner")) return new Response("Not found", { status: 404 });
  const [people, rows] = await Promise.all([
    db().select().from(members).orderBy(asc(members.displayName)),
    db()
      .select({ month: schedules.month, status: schedules.status, date: sessions.date, start: sessions.startTime, end: sessions.endTime, cancelled: sessions.isCancelled, location: locations.name, ids: assignments.memberIds })
      .from(sessions)
      .innerJoin(schedules, eq(schedules.id, sessions.scheduleId))
      .innerJoin(locations, eq(locations.id, sessions.locationId))
      .leftJoin(assignments, eq(assignments.sessionId, sessions.id))
      .orderBy(asc(sessions.date), asc(sessions.startTime)),
  ]);
  const name = new Map(people.map((p) => [p.id, `${p.title} ${p.displayName}`]));

  const book = new ExcelJS.Workbook();
  book.creator = "PW Scheduler";
  const bold = { font: { bold: true } };
  const m = book.addWorksheet("Members");
  m.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Title", key: "title", width: 7 },
    { header: "Privilege", key: "privilege", width: 18 },
    { header: "Own limit", key: "limit", width: 10 },
    { header: "Availability", key: "mode", width: 14 },
    { header: "WhatsApp", key: "phone", width: 16 },
    { header: "Active", key: "active", width: 8 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  for (const p of people)
    m.addRow({ name: p.displayName, title: p.title, privilege: p.privilege.replace("_", " "), limit: p.maxSessionsOverride ?? "", mode: p.availabilityMode.replace("_", " "), phone: p.phoneE164 ?? "", active: p.active && !p.archivedAt ? "yes" : "no", notes: p.notes ?? "" });
  m.getRow(1).font = bold.font;

  const s = book.addWorksheet("Sessions");
  s.columns = [
    { header: "Month", key: "month", width: 9 },
    { header: "Status", key: "status", width: 10 },
    { header: "Date", key: "date", width: 11 },
    { header: "Day", key: "day", width: 10 },
    { header: "Time", key: "time", width: 18 },
    { header: "Location", key: "location", width: 28 },
    { header: "People", key: "people", width: 46 },
  ];
  for (const r of rows)
    s.addRow({
      month: r.month,
      status: r.status,
      date: r.date,
      day: WEEKDAY_NAMES[weekdayOf(r.date)],
      time: formatTimeRange(r.start, r.end),
      location: r.location,
      people: r.cancelled ? "No session" : (r.ids ?? []).map((id) => name.get(id) ?? "?").join(" & "),
    });
  s.getRow(1).font = bold.font;

  return new Response(new Uint8Array(await book.xlsx.writeBuffer()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pw-scheduler-export-${todayInAccra()}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
