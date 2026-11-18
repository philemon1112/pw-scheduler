import { auditLog } from "./schema";
import type { AnyDb } from "./types";

/**
 * One line in the audit log (§14): who did what to which thing, and what
 * changed. The diff holds field values only — never a full message body or
 * anything a person typed to someone else.
 */
export async function audit(
  database: AnyDb,
  entry: { userId: string; action: string; entity: string; entityId?: string | null; diff?: unknown }
) {
  await database.insert(auditLog).values({
    userId: entry.userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    diff: entry.diff ?? null,
  });
}

/** The fields that differ between two versions of a row. */
export function changes<T extends Record<string, unknown>>(before: T, after: Partial<T>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) out[key] = { from, to };
  }
  return out;
}
