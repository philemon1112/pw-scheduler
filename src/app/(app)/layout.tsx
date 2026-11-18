import { Sidebar } from "@/components/shell/sidebar";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { TabBar } from "@/components/shell/tab-bar";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/db/queries/settings";

/**
 * The signed-in shell, and the gate: every route under `(app)` is behind
 * `requireUser()`, so adding a page can't accidentally ship an open one.
 *
 * Sidebar on desktop, glass tab bar on a phone. The bottom padding clears the
 * tab bar, or the last card on every page would sit underneath it.
 */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const settings = await getSettings();

  return (
    <div className="min-h-dvh">
      <Sidebar
        congregation={settings.congregationName}
        user={{ name: user.name, role: user.role }}
        footer={<SignOutButton className="min-h-11 rounded-xl text-[0.8125rem] text-inverted-muted hover:text-white" />}
      />
      <TabBar footer={<SignOutButton className="row-hover min-h-12 rounded-xl px-3 text-[0.9375rem] font-medium text-muted-foreground" />} />
      <div className="md:pl-64">
        <main className="mx-auto w-full max-w-[1400px] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-32 sm:px-6 md:pb-12 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
