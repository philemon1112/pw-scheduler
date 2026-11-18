import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import type * as schema from "./schema";

/**
 * Any Drizzle Postgres handle over this schema: the Neon pool in the app and
 * scripts, PGlite in tests. Code that writes several tables together takes
 * one of these, so it runs — and is tested — the same either way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema, any>;
