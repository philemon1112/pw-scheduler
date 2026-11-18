import type { DefaultSession } from "next-auth";

export type Role = "owner" | "editor" | "viewer";

declare module "next-auth" {
  interface User {
    role: Role;
  }
  interface Session {
    user: { id: string; role: Role } & DefaultSession["user"];
  }
}
