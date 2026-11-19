import "server-only";

import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { memberForToken } from "@/db/member-portal";
import { hit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { hashToken } from "@/lib/tokens";

/**
 * The gate for every public member page and action (§14): rate-limited by
 * address and by link, then the token must belong to an active member. A
 * wrong link is a plain 404 — it says nothing about whether it ever existed.
 */
export async function portalMember(token: string) {
  const ip = await requestIp();
  const [byIp, byToken] = await Promise.all([hit(`m:ip:${ip}`, 120, 60), hit(`m:t:${hashToken(token).slice(0, 32)}`, 60, 60)]);
  if (!byIp.allowed || !byToken.allowed) throw new Error("RATE_LIMITED");
  const member = await memberForToken(db(), token);
  if (!member) notFound();
  return member;
}
