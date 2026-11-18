import { readdirSync, readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/**
 * `pnpm db:local` — a real Postgres for local work, with nothing to install.
 *
 * PGlite is Postgres compiled to WebAssembly. This keeps its data in
 * `.local-db/` and serves it over the normal Postgres protocol on port 54329,
 * so the app connects to it exactly as it would to any Postgres:
 *
 *     DATABASE_URL="postgres://postgres@localhost:54329/postgres"
 *
 * Migrations in `drizzle/` are applied on start, once each. Stop it with
 * Ctrl-C. Neon is still what runs in production (docs/SETUP.md); this is
 * for trying the app before Neon is set up, and for working offline.
 */
const PORT = Number(process.env.LOCAL_DB_PORT ?? 54329);

async function main() {
  const db = new PGlite("./.local-db");
  await db.exec("create table if not exists __local_migrations (name text primary key, applied_at timestamptz default now())");
  const applied = new Set((await db.query<{ name: string }>("select name from __local_migrations")).rows.map((row) => row.name));

  for (const file of readdirSync("./drizzle").filter((name) => name.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    for (const statement of readFileSync(`./drizzle/${file}`, "utf8").split("--> statement-breakpoint")) {
      if (statement.trim()) await db.exec(statement);
    }
    await db.query("insert into __local_migrations (name) values ($1)", [file]);
    console.log(`applied ${file}`);
  }

  const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  console.log(`Local Postgres on postgres://postgres@localhost:${PORT}/postgres — Ctrl-C to stop.`);

  const stop = async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
