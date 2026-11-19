import { defineConfig } from "@playwright/test";

/**
 * Smoke tests (§16 milestone 8) against a running app — a local build on the
 * local database, or a preview deploy. They use the installed Chrome, so no
 * browser download is needed. See docs/SETUP.md, "Smoke tests".
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3124",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
    trace: "retain-on-failure",
  },
});
