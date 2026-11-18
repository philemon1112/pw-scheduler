import { NextResponse, type NextRequest } from "next/server";

import { isPublicPath } from "@/auth.config";

/**
 * The optimistic gate (Next 16 calls middleware "proxy").
 *
 * It only asks "is there a session cookie?", which is all Next recommends a
 * proxy do: no database, no token decoding, nothing slow on every request.
 * Without one, it sends the visitor to /login and keeps the page they wanted.
 * A forged or expired cookie gets past this and is stopped by the real check,
 * `requireUser()`, which every page and server action makes next to the data.
 */
const SESSION_COOKIES = ["authjs.session-token", "__Secure-authjs.session-token"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const signedIn = SESSION_COOKIES.some((name) => request.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.nextUrl);
  if (pathname !== "/") login.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and files with an extension.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-z0-9]+$).*)"],
};
