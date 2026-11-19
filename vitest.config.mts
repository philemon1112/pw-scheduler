import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    // The database tests boot an in-memory Postgres and replay every
    // migration; several at once on a laptop can pass five seconds.
    testTimeout: 120_000,
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // `server-only` throws outside a React Server Component bundle; tests run
    // the pure logic directly.
    alias: { "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)) },
  },
});
