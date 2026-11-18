import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/**
 * A fixed-window counter in Postgres (DECISIONS D5).
 *
 * One upsert per call: the window resets when it has expired, otherwise the
 * count goes up, and the new count comes back in the same round trip. Good
 * enough for a congregation-sized app — it is a brake on guessing, not a
 * defence against a botnet.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
  const [row] = await db()
    .insert(rateLimits)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then 1 else ${rateLimits.count} + 1 end`,
        windowStart: sql`case when ${rateLimits.windowStart} < now() - make_interval(secs => ${windowSeconds}) then now() else ${rateLimits.windowStart} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return { allowed: row.count <= limit, remaining: Math.max(0, limit - row.count) };
}
