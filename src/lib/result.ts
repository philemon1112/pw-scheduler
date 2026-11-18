/** What every server action returns (§15): success with data, or one sentence. */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const fail = (error: string) => ({ ok: false as const, error });

/** The first Zod issue, as a sentence. */
export const firstIssue = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? "Something was missing.";
