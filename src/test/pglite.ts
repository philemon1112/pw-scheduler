import { readdirSync, readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "@/db/schema";

/**
 * A real Postgres, in memory, with every migration applied — for tests that
 * need the database's own behaviour (constraints, the pair-history view,
 * transactions) rather than a mock of it.
 */
export async function testDb() {
  const client = new PGlite();
  const dir = new URL("../../drizzle/", import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) {
    for (const statement of readFileSync(new URL(file, dir), "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
  return { db: drizzle(client, { schema }), client };
}
