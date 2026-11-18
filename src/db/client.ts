import "server-only";

import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

/**
 * Two handles on the same database (§3).
 *
 * - `db()` — the Neon HTTP driver. One short request per query, which is the
 *   shape that survives serverless cold starts. Used for nearly everything.
 * - `transaction(fn)` — a WebSocket `Pool`, because the HTTP driver has no
 *   interactive transactions. Used where several writes must land together:
 *   saving a generated schedule, applying a swap, an import.
 *
 * Built lazily, so `next build` succeeds without a `DATABASE_URL`, and the
 * first query is what says it is missing — in a sentence.
 */

let http: ReturnType<typeof drizzleHttp<typeof schema>> | null = null;

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon pooled connection string (see docs/SETUP.md).");
  }
  return value;
}

export function db() {
  if (!http) http = drizzleHttp(neon(url()), { schema });
  return http;
}

export type Db = ReturnType<typeof db>;

// Node before 22 has no global WebSocket; Vercel's Node runtime is fine
// either way, and this is a no-op where one exists.
if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;

export async function transaction<T>(fn: (tx: Parameters<Parameters<ReturnType<typeof drizzlePool<typeof schema>>["transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  const pool = new Pool({ connectionString: url() });
  try {
    return await drizzlePool(pool, { schema }).transaction(fn);
  } finally {
    await pool.end();
  }
}
