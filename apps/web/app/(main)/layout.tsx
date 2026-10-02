import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SessionEnded } from "@/components/auth/SessionEnded";
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { AppShell } from "@/components/layout/AppShell";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { fetchSubscriptionStatus } from "@/lib/api/billing";
import { getSession } from "@/lib/auth/getSession";
import { formatLongDate } from "@/lib/datetime";
import { staffMenuFor } from "@/lib/navigation";

type Props = {
  children: ReactNode;
};

// Area owner/admin/atasan (+ banner pengingat langganan untuk owner/admin). Proxy sudah mengarahkan user lain; redirect di sini hanya cadangan.
export default async function MainLayout({ children }: Props) {
  const session = await getSession();
  const activeTenant = session?.activeTenant;
  // Token masih terbaca proxy tapi API menolak sesi/usaha (mis. tenant dinonaktifkan) → akhiri sesi
  if (!session || !activeTenant) return <SessionEnded />;
  if (activeTenant.role === "karyawan") redirect("/me");

  // Pengingat langganan (feature 40) untuk owner/admin. Gagal dimuat → tanpa banner (halaman tetap jalan)
  const canSeeBilling = activeTenant.role === "owner" || activeTenant.role === "admin";
  const subscription = canSeeBilling ? await fetchSubscriptionStatus() : null;

  return (
    <AppShell
      user={session.user}
      headerStart={<TenantSwitcher activeTenant={activeTenant} tenants={session.tenants} />}
      sections={staffMenuFor(activeTenant.role)}
      todayLabel={formatLongDate(new Date())}
      showPortalLink
    >
      {subscription?.ok ? <SubscriptionBanner summary={subscription.data} canManage={activeTenant.role === "owner"} /> : null}
      {children}
    </AppShell>
  );
}
