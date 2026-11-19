/**
 * Names as they arrive from old sheets and typed lists (§9).
 *
 * "Henry Atsu Dameh.", "  julia   eshun", "HAGAR NYARKOA" all have to land on
 * the right person, and the match has to be exact once cleaned — guessing
 * between two similar names is how someone ends up booked for another
 * person's session. Anything that doesn't match goes to the import review
 * screen instead.
 */

/** Trim, drop trailing full stops, collapse spaces. Case is kept for display. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().replace(/\.+$/, "").trim();
}

/** The comparison key: cleaned and lower-cased. */
export const nameKey = (raw: string) => cleanName(raw).toLowerCase();

/** "Kwabena Adusei Snr" → first "Kwabena", last "Adusei Snr". */
export function splitName(raw: string): { firstName: string; lastName: string } {
  const [firstName, ...rest] = cleanName(raw).split(" ");
  return { firstName: firstName ?? "", lastName: rest.join(" ") };
}

export interface Nameable {
  id: string;
  displayName: string;
  aliases: string[];
}

/** An index from every known spelling to the member it belongs to. */
export function nameIndex<T extends Nameable>(members: T[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const member of members) {
    for (const name of [member.displayName, ...member.aliases]) index.set(nameKey(name), member);
  }
  return index;
}

/** The member a name refers to, or null when it needs reviewing. */
export const matchName = <T extends Nameable>(index: Map<string, T>, raw: string): T | null => index.get(nameKey(raw)) ?? null;

/**
 * Two names typed with nothing between them — "Davida AduseiComfort Owusua"
 * — split where both halves are known people. A name already known, or one
 * that can't be split that way, comes back as it was.
 */
export function splitKnownNames(raw: string, isKnown: (name: string) => boolean): string[] {
  const name = cleanName(raw);
  if (isKnown(name)) return [name];
  for (let k = 2; k < name.length - 1; k += 1) {
    const left = cleanName(name.slice(0, k));
    const right = cleanName(name.slice(k));
    if (left.length > 2 && right.length > 2 && isKnown(left) && isKnown(right)) return [left, right];
  }
  return [name];
}
