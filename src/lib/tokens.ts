import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

/**
 * Member link tokens (§13, §14, DECISIONS D7 and D26): 32 random bytes as
 * base64url. Looked up by SHA-256 hash; also kept encrypted with a key
 * derived from AUTH_SECRET, so the app can put a person's link in their
 * monthly message. A copy of the database without the server's secret still
 * hands out no working links.
 */
export const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Cheap shape check before any database lookup. */
export const looksLikeToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "pw-scheduler", "member-link-v1", 32));
}

/** AES-256-GCM: iv (12) + tag (16) + ciphertext, as base64url. */
export function sealToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The token back, or null if it was sealed with another secret or tampered with. */
export function openToken(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The app's public address, without a trailing slash. */
export const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

export const memberUrl = (token: string, path = "") => `${appUrl()}/m/${token}${path}`;
