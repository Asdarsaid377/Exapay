import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SessionEnded } from "@/components/auth/SessionEnded";
import { AppShell } from "@/components/layout/AppShell";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { getSession } from "@/lib/auth/getSession";
import { formatLongDate } from "@/lib/datetime";
import { staffMenuFor } from "@/lib/navigation";

type Props = {
  children: ReactNode;
};

// Area owner/admin/atasan. Proxy sudah mengarahkan user lain; redirect di sini hanya cadangan.
export default async function MainLayout({ children }: Props) {
  const session = await getSession();
  const activeTenant = session?.activeTenant;
  // Token masih terbaca proxy tapi API menolak sesi/usaha (mis. tenant dinonaktifkan) → akhiri sesi
  if (!session || !activeTenant) return <SessionEnded />;
  if (activeTenant.role === "karyawan") redirect("/me");

  return (
    <AppShell
      user={session.user}
      headerStart={<TenantSwitcher activeTenant={activeTenant} tenants={session.tenants} />}
      sections={staffMenuFor(activeTenant.role)}
      todayLabel={formatLongDate(new Date())}
      showPortalLink
    >
      {children}
    </AppShell>
  );
}
