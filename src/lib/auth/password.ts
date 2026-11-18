import bcrypt from "bcryptjs";

/**
 * Password hashing. bcryptjs is pure JavaScript, so nothing native has to
 * build on Vercel (DECISIONS D4). Cost 12 is about 250ms on a laptop: slow
 * enough to hurt a guesser, quick enough not to be noticed at sign-in.
 */
const COST = 12;

export const hashPassword = (password: string) => bcrypt.hash(password, COST);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** A hash to compare against when the email is unknown, so a wrong email and
 *  a wrong password take the same time and can't be told apart. */
export const DUMMY_HASH = "$2b$12$WmWMXuFCQoyrIo.N.L5gp.62r9Vps/6J5YaS9um16.PZP8lo7c3Ma";

/** The rules for a new password, shared by the owner bootstrap and invites. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "That's longer than a password needs to be.";
  return null;
}
