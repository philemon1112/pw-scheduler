import { readFileSync } from "node:fs";

import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import ws from "ws";

import { planSeed } from "@/lib/import/seed-plan";

import * as schema from "./schema";
import { applySeed } from "./seed-apply";

/**
 * `pnpm db:seed` — load `seed/pw-history-2026.json` into the database in
 * `DATABASE_URL`. Run `pnpm db:migrate` first. Safe to run again.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set — see docs/SETUP.md.");
  if (typeof WebSocket === "undefined") neonConfig.webSocketConstructor = ws;

  const raw = JSON.parse(readFileSync(new URL("../../seed/pw-history-2026.json", import.meta.url), "utf8"));
  const plan = planSeed(raw);
  const local = /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);
  const pool = local ? new pg.Pool({ connectionString: url }) : new Pool({ connectionString: url });
  try {
    const database = local ? drizzleNodePg(pool as pg.Pool, { schema }) : drizzle(pool as Pool, { schema });
    const report = await applySeed(database as unknown as Parameters<typeof applySeed>[0], plan, raw);
    console.log(`Locations: ${report.locations}, slots: ${report.slots}`);
    console.log(`Members added: ${report.membersAdded} (existing ones were left as they are)`);
    console.log(`Couples added: ${report.couplesAdded}`);
    if (report.specialDaysAdded) console.log("Added National Sanitation Day (first Saturday, ends 10:00).");
    for (const month of report.months) {
      console.log(`  ${month.month}: ${month.action}${month.reason ? ` — ${month.reason}` : `, ${month.sessions} sessions`}`);
    }
    for (const note of plan.notes) console.log(`  note: ${note}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
