"use server";

import { transaction } from "@/db/client";
import { acceptInvite, UserError } from "@/db/mutations/users";
import { hit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { looksLikeToken } from "@/lib/tokens";
import type { Result } from "@/lib/result";

/** The invited person chooses a password. Public, so rate-limited and token-checked here. */
export async function acceptInviteAction(token: string, password: string): Promise<Result<{ email: string }>> {
  const limited = await hit(`invite:${await requestIp()}`, 10, 900);
  if (!limited.allowed) return { ok: false, error: "Too many tries. Please wait a few minutes." };
  if (!looksLikeToken(String(token)) || typeof password !== "string") return { ok: false, error: "This invite link doesn't work." };
  try {
    const invite = await transaction((tx) => acceptInvite(tx, token, password));
    return { ok: true, email: invite.email };
  } catch (error) {
    if (error instanceof UserError) return { ok: false, error: error.message };
    return { ok: false, error: "That didn't go through. Try again in a moment." };
  }
}
