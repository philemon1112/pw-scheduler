import { describe, expect, it } from "vitest";

import { displayPhone, normalisePhone } from "@/lib/members/phone";
import { hashToken, looksLikeToken, newToken } from "@/lib/tokens";

import { cleanName, matchName, nameIndex, nameKey, splitName } from "./names";

describe("names", () => {
  it("cleans the way the sheets are typed", () => {
    expect(cleanName("  Henry  Atsu Dameh. ")).toBe("Henry Atsu Dameh");
    expect(cleanName("Julia Eshun..")).toBe("Julia Eshun");
    expect(nameKey("HAGAR   NYARKOA")).toBe("hagar nyarkoa");
  });
  it("splits first name from the rest", () => {
    expect(splitName("Kwabena Adusei Snr")).toEqual({ firstName: "Kwabena", lastName: "Adusei Snr" });
    expect(splitName("Sarah Atokey")).toEqual({ firstName: "Sarah", lastName: "Atokey" });
  });
  it("matches display names and aliases, case-insensitively, and nothing else", () => {
    const index = nameIndex([
      { id: "1", displayName: "Henry Atsu Damey", aliases: ["Henry Atsu Dameh"] },
      { id: "2", displayName: "Julia Eshun", aliases: [] },
    ]);
    expect(matchName(index, "henry atsu dameh.")?.id).toBe("1");
    expect(matchName(index, " JULIA ESHUN ")?.id).toBe("2");
    expect(matchName(index, "Julia Esh")).toBeNull();
  });
});

describe("phone numbers", () => {
  it("normalises every way a Ghana number is written", () => {
    for (const raw of ["024 123 4567", "0241234567", "+233 24 123 4567", "233241234567", "241234567", "00233241234567", "(024) 123-4567"]) {
      expect(normalisePhone(raw), raw).toEqual({ ok: true, e164: "+233241234567" });
    }
  });
  it("keeps other countries in E.164 and rejects nonsense", () => {
    expect(normalisePhone("+44 7700 900123")).toEqual({ ok: true, e164: "+447700900123" });
    expect(normalisePhone("12345").ok).toBe(false);
    expect(normalisePhone("0141234567").ok).toBe(false);
    expect(normalisePhone("").ok).toBe(false);
  });
  it("displays Ghana numbers the local way", () => {
    expect(displayPhone("+233241234567")).toBe("024 123 4567");
    expect(displayPhone("+447700900123")).toBe("+447700900123");
  });
});

describe("tokens", () => {
  it("are 32 random bytes, unique, and hashed to 64 hex characters", () => {
    const a = newToken();
    const b = newToken();
    expect(looksLikeToken(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});
