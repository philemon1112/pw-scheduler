/**
 * Times as people write them in messages and on the sheet (§12):
 * `6:00 – 8:00 am`, an en dash with spaces, lowercase am/pm — and the am/pm
 * always worked out from the 24-hour time, never typed, which is how
 * "9:30 – 11:30 pm" crept into a schedule that meant the morning.
 */

/** `"06:00"` or `"06:00:00"` → minutes after midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes after midnight → `"06:00"`. */
export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const parts = (time: string) => {
  const minutes = minutesOf(time);
  const h = Math.floor(minutes / 60);
  return { clock: `${h % 12 === 0 ? 12 : h % 12}:${String(minutes % 60).padStart(2, "0")}`, period: h < 12 ? "am" : "pm" };
};

/** `"06:00"` → `"6:00 am"`. */
export function formatTime(time: string): string {
  const { clock, period } = parts(time);
  return `${clock} ${period}`;
}

/** `"06:00", "08:00"` → `"6:00 – 8:00 am"`; across noon, `"10:00 am – 12:00 pm"`. */
export function formatTimeRange(start: string, end: string): string {
  const a = parts(start);
  const b = parts(end);
  return a.period === b.period ? `${a.clock} – ${b.clock} ${b.period}` : `${a.clock} ${a.period} – ${b.clock} ${b.period}`;
}
