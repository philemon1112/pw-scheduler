import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/auth.config";
import { canBootstrapOwner, timingSafeEqual } from "@/lib/auth/bootstrap";
import { DUMMY_HASH, hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { hasRole } from "@/lib/auth/roles";

const owner = { ownerEmail: "Lemon@Example.com", ownerPassword: "correct horse battery", ownerExists: false };

describe("owner bootstrap", () => {
  it("creates the owner from the env values, ignoring email case", () => {
    expect(canBootstrapOwner({ ...owner, email: " lemon@example.com ", password: "correct horse battery" })).toBe(true);
  });
  it("refuses once an owner exists", () => {
    expect(canBootstrapOwner({ ...owner, ownerExists: true, email: "lemon@example.com", password: "correct horse battery" })).toBe(false);
  });
  it("refuses a wrong password or another email", () => {
    expect(canBootstrapOwner({ ...owner, email: "lemon@example.com", password: "wrong" })).toBe(false);
    expect(canBootstrapOwner({ ...owner, email: "someone@example.com", password: "correct horse battery" })).toBe(false);
  });
  it("refuses when the env values are missing", () => {
    expect(canBootstrapOwner({ ...owner, ownerPassword: undefined, email: "lemon@example.com", password: "" })).toBe(false);
    expect(canBootstrapOwner({ ...owner, ownerEmail: "", email: "", password: "correct horse battery" })).toBe(false);
  });
  it("compares strings fully", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("a long enough password");
    expect(await verifyPassword("a long enough password", hash)).toBe(true);
    expect(await verifyPassword("something else", hash)).toBe(false);
  }, 120_000);
  it("the timing dummy is a real hash that matches nothing typed", async () => {
    expect(await verifyPassword("", DUMMY_HASH)).toBe(false);
  }, 120_000);
  it("explains a weak password", () => {
    expect(passwordProblem("short")).toMatch(/10 characters/);
    expect(passwordProblem("a perfectly fine one")).toBeNull();
  });
});

describe("access", () => {
  it("only the login page, member links, calendar files and auth are public", () => {
    for (const path of ["/login", "/m/abc", "/m/abc/availability", "/api/ics/1", "/api/cal/tok.ics", "/api/auth/session"]) {
      expect(isPublicPath(path), path).toBe(true);
    }
    for (const path of ["/", "/schedule", "/members", "/settings", "/print/2026-11", "/loginx", "/mx"]) {
      expect(isPublicPath(path), path).toBe(false);
    }
  });
  it("roles rank owner > editor > viewer", () => {
    expect(hasRole({ role: "owner" }, "editor")).toBe(true);
    expect(hasRole({ role: "editor" }, "editor")).toBe(true);
    expect(hasRole({ role: "viewer" }, "editor")).toBe(false);
    expect(hasRole({ role: "editor" }, "owner")).toBe(false);
  });
});
