import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SessionEnded } from "@/components/auth/SessionEnded";
import { AppShell } from "@/components/layout/AppShell";
import { getSession } from "@/lib/auth/getSession";
import { formatLongDate } from "@/lib/datetime";
import { ADMIN_MENU } from "@/lib/navigation";

type Props = {
  children: ReactNode;
};

// Area super-admin /admin: kerangka yang sama dengan area usaha, navigasi sendiri, tanpa tenant switcher.
// Proxy sudah menolak non-super-admin; redirect di sini hanya cadangan. API tetap memeriksa flag super-admin.
export default async function AdminLayout({ children }: Props) {
  const session = await getSession();
  if (!session) return <SessionEnded />;
  if (!session.user.isSuperAdmin) redirect("/");

  return (
    <AppShell
      user={session.user}
      headerStart={
        <div className="flex min-w-0 flex-col px-2 py-1 lg:px-3.5">
          <span className="truncate font-display text-[14.5px] font-bold text-text-primary lg:text-[15px]">Panel Super-admin</span>
          <span className="truncate text-caption text-text-secondary lg:text-[13px]">Platform Exapay</span>
        </div>
      }
      sections={[...ADMIN_MENU]}
      todayLabel={formatLongDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
