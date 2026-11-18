"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";

export type LoginState = { error: string | null; email: string };

/**
 * Sign in. Auth.js redirects on success by throwing, so only failures come
 * back here — and they come back as one sentence that doesn't say which of
 * the two fields was wrong.
 */
export async function loginAction(_previous: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "");
  const next = String(form.get("next") ?? "/schedule");
  try {
    await signIn("credentials", {
      email,
      password: String(form.get("password") ?? ""),
      // Only same-site paths, so the login page can't be used to bounce
      // someone to another website.
      redirectTo: next.startsWith("/") && !next.startsWith("//") ? next : "/schedule",
    });
    return { error: null, email };
  } catch (error) {
    if (error instanceof AuthError) {
      const code = (error as AuthError & { code?: string }).code;
      return {
        email,
        error:
          code === "too_many_attempts"
            ? "Too many attempts. Wait fifteen minutes and try again."
            : "That email and password don't match an account.",
      };
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
