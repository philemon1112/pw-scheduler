import "server-only";

import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePool } from "drizzle-orm/neon-serverless";
import pg from "pg";
import ws from "ws";

import * as schema from "./schema";
import type { AnyDb } from "./types";

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
 *
 * A `localhost` URL (`pnpm db:local`, or any Postgres on this machine) uses
 * node-postgres instead: Neon's drivers only speak to Neon.
 */

let http: ReturnType<typeof drizzleHttp<typeof schema>> | null = null;

function url(): string {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon pooled connection string (see docs/SETUP.md).");
  }
  return value;
}

const isLocal = (value: string) => /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(value);
let local: pg.Pool | null = null;
const localPool = () => (local ??= new pg.Pool({ connectionString: url(), max: 5 }));

export function db() {
  if (!http) {
    // Same query API either way; the cast keeps one type for the app.
    http = isLocal(url())
      ? (drizzleNodePg(localPool(), { schema }) as unknown as ReturnType<typeof drizzleHttp<typeof schema>>)
      : drizzleHttp(neon(url()), { schema });
  }
  return http;
}

export type Db = ReturnType<typeof db>;

// Node before 22 has no global WebSocket; Vercel's Node runtime is fine
// either way, and this is a no-op where one exists.
if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;

/** Run `fn` in one transaction over a WebSocket pool (the HTTP driver can't). */
export async function transaction<T>(fn: (tx: AnyDb) => Promise<T>): Promise<T> {
  if (isLocal(url())) return drizzleNodePg(localPool(), { schema }).transaction((tx) => fn(tx as unknown as AnyDb));
  const pool = new Pool({ connectionString: url() });
  try {
    return await drizzlePool(pool, { schema }).transaction((tx) => fn(tx as unknown as AnyDb));
  } finally {
    await pool.end();
  }
}
