import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Off on purpose (DECISIONS D11): every page here reads the session and the
  // database per request, and Cache Components would require a Suspense
  // boundary around each of those reads. The previous model is simpler for a
  // signed-in admin app, and nothing here benefits from a static shell.
  cacheComponents: false,
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
