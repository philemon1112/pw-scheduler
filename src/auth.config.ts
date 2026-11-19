import type { NextAuthConfig } from "next-auth";

import type { Role } from "@/types/next-auth";

/**
 * The part of the auth setup that is safe to run in the proxy: no database,
 * no password hashing. The proxy only makes the optimistic "is there a
 * session cookie" check (Next's own guidance); every page and server action
 * checks again, properly, with `requireUser()`.
 */

/** Routes anyone may open (§14). Everything else needs a session. */
export const PUBLIC_PATHS = [/^\/login(\/|$)/, /^\/invite\//, /^\/m\//, /^\/api\/ics\//, /^\/api\/cal\//, /^\/api\/auth\//];

export const isPublicPath = (pathname: string) => PUBLIC_PATHS.some((pattern) => pattern.test(pathname));

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      // Only present on sign-in; afterwards the token already carries them.
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      const claims = token as { uid?: string; role?: Role };
      if (claims.uid) session.user.id = claims.uid;
      if (claims.role) session.user.role = claims.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
