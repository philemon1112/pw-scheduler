import "server-only";

import { headers } from "next/headers";

/** The caller's address for rate limiting: the first hop Vercel reports, or "local". */
export async function requestIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}
