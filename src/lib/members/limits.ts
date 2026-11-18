export type Privilege = "publisher" | "auxiliary_pioneer" | "regular_pioneer";

export const PRIVILEGES: Privilege[] = ["publisher", "auxiliary_pioneer", "regular_pioneer"];

export const PRIVILEGE_LABELS: Record<Privilege, string> = {
  publisher: "Publisher",
  auxiliary_pioneer: "Auxiliary pioneer",
  regular_pioneer: "Regular pioneer",
};

/** A person's monthly limit: their own override, otherwise their privilege's. */
export function monthlyLimit(member: { privilege: Privilege; maxSessionsOverride: number | null }, limits: Record<Privilege, number>): number {
  return member.maxSessionsOverride ?? limits[member.privilege];
}
