import { beforeAll, describe, expect, it } from "vitest";

import { hashToken, looksLikeToken, newToken, openToken, sealToken } from "./tokens";

beforeAll(() => {
  process.env.AUTH_SECRET = "test-secret-for-tokens-0123456789";
});

describe("member tokens", () => {
  it("are 32 random bytes in base64url", () => {
    const token = newToken();
    expect(looksLikeToken(token)).toBe(true);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(newToken()).not.toBe(token);
  });

  it("seal and open, with a fresh iv each time", () => {
    const token = newToken();
    const a = sealToken(token);
    const b = sealToken(token);
    expect(a).not.toBe(b);
    expect(openToken(a)).toBe(token);
    expect(openToken(b)).toBe(token);
    expect(a).not.toContain(token);
    expect(hashToken(token)).toHaveLength(64);
  });

  it("won't open with another secret or after tampering", () => {
    const sealed = sealToken(newToken());
    const flipped = Buffer.from(sealed, "base64url");
    flipped[flipped.length - 1] ^= 1;
    expect(openToken(flipped.toString("base64url"))).toBeNull();
    process.env.AUTH_SECRET = "a-different-secret-0123456789";
    expect(openToken(sealed)).toBeNull();
    process.env.AUTH_SECRET = "test-secret-for-tokens-0123456789";
    expect(openToken(null)).toBeNull();
  });
});
