import "server-only";

import { count, eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { db } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { canBootstrapOwner } from "@/lib/auth/bootstrap";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { hit } from "@/lib/rate-limit";

class TooManyAttempts extends CredentialsSignin {
  code = "too_many_attempts";
}

const Credentials$ = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(200),
});

/**
 * Email + password, JWT sessions, invite-only (§2, §3).
 *
 * `authorize` is the one place a password is checked. It rate-limits by
 * email and by address, creates the owner on the very first sign-in (see
 * `canBootstrapOwner`), and otherwise compares against the stored hash —
 * against a dummy hash when the email is unknown, so the two failures take
 * the same time.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = Credentials$.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
        const [byEmail, byAddress] = await Promise.all([hit(`login:email:${email}`, 8, 900), hit(`login:ip:${address}`, 30, 900)]);
        if (!byEmail.allowed || !byAddress.allowed) throw new TooManyAttempts();

        const [user] = await db().select().from(users).where(eq(users.email, email)).limit(1);

        if (!user) {
          const [{ owners }] = await db().select({ owners: count() }).from(users).where(eq(users.role, "owner"));
          const bootstrap = canBootstrapOwner({
            email,
            password,
            ownerEmail: process.env.OWNER_EMAIL,
            ownerPassword: process.env.OWNER_INITIAL_PASSWORD,
            ownerExists: owners > 0,
          });
          if (!bootstrap) {
            await verifyPassword(password, DUMMY_HASH);
            return null;
          }
          const [owner] = await db()
            .insert(users)
            .values({ email, name: "Owner", passwordHash: await hashPassword(password), role: "owner", lastLoginAt: new Date() })
            .returning();
          await db().insert(auditLog).values({ userId: owner.id, action: "bootstrap_owner", entity: "user", entityId: owner.id });
          return { id: owner.id, email: owner.email, name: owner.name, role: owner.role };
        }

        // A removed account, or an invite not yet accepted, can't sign in.
        if (user.disabledAt || user.inviteTokenHash) {
          await verifyPassword(password, DUMMY_HASH);
          return null;
        }
        if (!(await verifyPassword(password, user.passwordHash))) return null;
        await db().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
