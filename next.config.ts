import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

/**
 * A basic Content Security Policy (§14). Next's own inline scripts need
 * 'unsafe-inline' without per-request nonces; everything else comes from
 * this origin. Development adds 'unsafe-eval' for fast refresh.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const security = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Member links carry their token in the path; never send it to another site.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: security },
      { source: "/m/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }, { key: "Cache-Control", value: "private, no-store" }] },
    ];
  },
  // Off on purpose (DECISIONS D11): every page here reads the session and the
  // database per request, and Cache Components would require a Suspense
  // boundary around each of those reads. The previous model is simpler for a
  // signed-in admin app, and nothing here benefits from a static shell.
  cacheComponents: false,
  poweredByHeader: false,
  serverExternalPackages: ["pg", "exceljs"],
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
