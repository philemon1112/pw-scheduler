import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { PasswordForm } from "@/components/settings/password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Your account" description={`${user.name} · ${user.email} · ${user.role}`} />
      <PasswordForm />
    </>
  );
}
