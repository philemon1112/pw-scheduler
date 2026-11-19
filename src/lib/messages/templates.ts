/**
 * Message wording (§12). Every message is a template with {placeholders};
 * the defaults are Lemon's own wording. The weekend message's per-location
 * blocks follow his Thursday message exactly and are built in code, so the
 * template around them stays short.
 */

export type MessageKind = "weekend_group" | "monthly_preview" | "pair_reminder" | "swap_offer";

export const DEFAULT_TEMPLATES: Record<MessageKind, string> = {
  weekend_group: "{greeting} @all\n{weekend_blocks}",
  monthly_preview:
    "Please this is the schedule for the Public Witnessing for {month}. You are booked for:\n{my_sessions}\nAdd to your calendar: {calendar_link}\nKindly let me know if it works for you. Thanks",
  pair_reminder:
    "{greeting} {name},\nA reminder that you and {partner} are on *{day} {date}*, {time} at {location}.\nKindly let me know if anything changes. Thank you",
  swap_offer:
    "{greeting} {name},\nCould you take the public witnessing session on *{day} {date}*, {time} at {location} with {partner}?\nKindly let me know. Thank you",
};

export const KIND_LABELS: Record<MessageKind, string> = {
  weekend_group: "Weekend group message",
  monthly_preview: "Monthly preview",
  pair_reminder: "Pair reminder",
  swap_offer: "Asking someone to cover",
};

export const PLACEHOLDERS: { key: string; hint: string; kinds: MessageKind[] }[] = [
  { key: "greeting", hint: "Good Morning / Afternoon / Evening, from the time you send it", kinds: ["weekend_group", "monthly_preview", "pair_reminder", "swap_offer"] },
  { key: "name", hint: "Their name with title: Bro Philemon Abakah", kinds: ["monthly_preview", "pair_reminder", "swap_offer"] },
  { key: "title", hint: "Bro or Sis", kinds: ["monthly_preview", "pair_reminder", "swap_offer"] },
  { key: "month", hint: "November 2026", kinds: ["monthly_preview"] },
  { key: "my_sessions", hint: "Their sessions, one per line", kinds: ["monthly_preview"] },
  { key: "partner", hint: "Who they serve with", kinds: ["pair_reminder", "swap_offer"] },
  { key: "date", hint: "13 Nov", kinds: ["pair_reminder", "swap_offer"] },
  { key: "day", hint: "Friday", kinds: ["pair_reminder", "swap_offer"] },
  { key: "time", hint: "6:00 – 8:00 am", kinds: ["pair_reminder", "swap_offer"] },
  { key: "location", hint: "Police Station – Westlands", kinds: ["pair_reminder", "swap_offer"] },
  { key: "calendar_link", hint: "Their private page, with calendar buttons", kinds: ["monthly_preview", "pair_reminder"] },
  { key: "availability_link", hint: "Where they set their availability", kinds: ["monthly_preview", "pair_reminder"] },
  { key: "weekend_blocks", hint: "The sessions, by location and day", kinds: ["weekend_group"] },
];

/** Fills {placeholders}. Unknown ones are left as written, so a typo shows instead of vanishing. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) => (key in values ? values[key] : match));
}

/** Good Morning before 12:00, Good Afternoon until 17:00, Good Evening after — in Accra. */
export function greetingAt(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Accra" }).format(now));
  return hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
}
