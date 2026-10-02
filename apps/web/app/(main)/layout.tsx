import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SessionEnded } from "@/components/auth/SessionEnded";
import { SubscriptionBanner } from "@/components/billing/SubscriptionBanner";
import { AppShell } from "@/components/layout/AppShell";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { fetchSubscriptionStatus } from "@/lib/api/billing";
import { fetchWorkShifts } from "@/lib/api/shiftRoster";
import { getSession } from "@/lib/auth/getSession";
import { formatLongDate } from "@/lib/datetime";
import { ROSTER_HREF, staffMenuFor } from "@/lib/navigation";

type Props = {
  children: ReactNode;
};

// Area owner/admin/atasan (+ banner pengingat langganan untuk owner/admin). Proxy sudah mengarahkan user lain; redirect di sini hanya cadangan.
export default async function MainLayout({ children }: Props) {
  const session = await getSession();
  const activeTenant = session?.activeTenant;
  // Super-admin tanpa usaha (mis. membuka path tak dikenal yang jatuh ke catch-all area ini) → panel super-admin, bukan logout
  if (session?.user.isSuperAdmin && !activeTenant) redirect("/admin/tenants");
  // Token masih terbaca proxy tapi API menolak sesi/usaha (mis. tenant dinonaktifkan) → akhiri sesi
  if (!session || !activeTenant) return <SessionEnded />;
  if (activeTenant.role === "karyawan") redirect("/me");

  // Pengingat langganan (feature 40) untuk owner/admin. Gagal dimuat → tanpa banner (halaman tetap jalan)
  const canSeeBilling = activeTenant.role === "owner" || activeTenant.role === "admin";
  const subscription = canSeeBilling ? await fetchSubscriptionStatus() : null;
  // Menu Roster hanya bila usaha punya master shift (feature 46). Gagal dimuat → menu tetap tampil (halaman roster menjelaskan)
  const shifts = await fetchWorkShifts();
  const hiddenHrefs = shifts.ok && shifts.data.items.length === 0 ? [ROSTER_HREF] : [];

  return (
    <AppShell
      user={session.user}
      headerStart={<TenantSwitcher activeTenant={activeTenant} tenants={session.tenants} />}
      sections={staffMenuFor(activeTenant.role, hiddenHrefs)}
      todayLabel={formatLongDate(new Date())}
      showPortalLink
    >
      {subscription?.ok ? <SubscriptionBanner summary={subscription.data} canManage={activeTenant.role === "owner"} /> : null}
      {children}
    </AppShell>
  );
}
