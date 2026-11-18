import type { Role } from "@/types/next-auth";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/** Owner > editor > viewer: a role can do everything the ones below it can. */
export const hasRole = (user: { role: Role }, needed: Role) => RANK[user.role] >= RANK[needed];
