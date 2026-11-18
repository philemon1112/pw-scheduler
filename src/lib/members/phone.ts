/**
 * Ghana numbers, normalised to E.164 (`+233…`) for `wa.me` links.
 *
 * People write them every way: "024 123 4567", "0241234567", "+233 24 123
 * 4567", "233241234567", even "241234567". A Ghana number is nine digits
 * after the country code, so all of those are the same. A number with any
 * other country code is kept as given, as long as it looks like E.164.
 */
export function normalisePhone(raw: string): { ok: true; e164: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: "Enter a number." };
  const digits = trimmed.replace(/[^\d]/g, "");
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");

  let national: string | null = null;
  if (!international && digits.length === 10 && digits.startsWith("0")) national = digits.slice(1);
  else if (!international && digits.length === 9) national = digits;
  else if (digits.startsWith("233") && digits.length === 12) national = digits.slice(3);
  else if (digits.startsWith("00233") && digits.length === 14) national = digits.slice(5);

  if (national) {
    if (!/^[235]\d{8}$/.test(national)) return { ok: false, error: "That doesn't look like a Ghana number." };
    return { ok: true, e164: `+233${national}` };
  }

  const e164 = digits.startsWith("00") ? digits.slice(2) : digits;
  if (international && e164.length >= 8 && e164.length <= 15) return { ok: true, e164: `+${e164}` };
  return { ok: false, error: "That doesn't look like a phone number. Try 024 123 4567." };
}

/** `+233241234567` → "024 123 4567"; other countries are shown as stored. */
export function displayPhone(e164: string): string {
  const ghana = e164.match(/^\+233(\d{2})(\d{3})(\d{4})$/);
  return ghana ? `0${ghana[1]} ${ghana[2]} ${ghana[3]}` : e164;
}
