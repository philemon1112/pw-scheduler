import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // `server-only` throws outside a React Server Component bundle; tests run
    // the pure logic directly.
    alias: { "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)) },
  },
});
