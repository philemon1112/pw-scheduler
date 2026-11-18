import { createHash, randomBytes } from "node:crypto";

/**
 * Member link tokens (§13, §14, DECISIONS D7): 32 random bytes as base64url,
 * stored only as a SHA-256 hash. The raw token exists once — in the link the
 * owner copies — so a leaked database hands out no working links.
 */
export const newToken = () => randomBytes(32).toString("base64url");

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Cheap shape check before any database lookup. */
export const looksLikeToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);
