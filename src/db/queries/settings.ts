import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";

export type Settings = typeof settings.$inferSelect;

/**
 * The single settings row, created with its defaults the first time it is
 * read. Cached per request: the layout and the page both need it.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  const [row] = await db().select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (row) return row;
  const [created] = await db().insert(settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db().select().from(settings).where(eq(settings.id, 1)).limit(1))[0];
});
