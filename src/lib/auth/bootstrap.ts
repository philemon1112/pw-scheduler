/**
 * Creating the owner account (§2: invite-only, no public sign-up).
 *
 * The first sign-in with `OWNER_EMAIL` and `OWNER_INITIAL_PASSWORD` creates
 * the owner — and only while no owner exists. After that the env values do
 * nothing, so leaving them set is not a standing back door, and changing the
 * password in the app is final.
 */
export function canBootstrapOwner(input: {
  email: string;
  password: string;
  ownerEmail: string | undefined;
  ownerPassword: string | undefined;
  ownerExists: boolean;
}): boolean {
  if (input.ownerExists) return false;
  if (!input.ownerEmail || !input.ownerPassword) return false;
  return (
    input.email.trim().toLowerCase() === input.ownerEmail.trim().toLowerCase() &&
    timingSafeEqual(input.password, input.ownerPassword)
  );
}

/** String comparison that doesn't return early on the first difference. */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
