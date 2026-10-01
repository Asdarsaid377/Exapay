import type { SessionUser, TenantMembership } from "@exapay/shared";
import type { ReactNode } from "react";

import { BackdropShapes } from "@/components/layout/BackdropShapes";
import { PortalBottomNav } from "@/components/layout/PortalBottomNav";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";
import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  user: SessionUser;
  activeTenant: TenantMembership;
  tenants: TenantMembership[];
  // Karyawan nonaktif: menu hanya Slip & Profil (feature 37)
  inactive: boolean;
  children: ReactNode;
};

// Kerangka portal karyawan /me (snapshot context/designs/me.html): header kaca + bottom nav kaca mengambang.
// Maks 3 lapisan blur di portal (header, kartu utama halaman, bottom nav) — card lain memakai surface-solid.
export function PortalShell({ user, activeTenant, tenants, inactive, children }: Props) {
  return (
    <>
      <BackdropShapes variant="portal" />
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-3.5 px-3.5 pt-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
        <header className="glass sticky top-3 z-20 flex h-15 shrink-0 items-center justify-between gap-2 rounded-[20px] pr-2 pl-2">
          <div className="min-w-0 flex-1">
            <TenantSwitcher activeTenant={activeTenant} tenants={tenants} subtitle={`${user.fullName} · ${ROLE_LABELS[activeTenant.role]}`} />
          </div>
          {/* Owner/admin/atasan membuka portal untuk absen (feature 14) — jalan kembali ke area sidebar */}
          <UserMenu user={user} showChevron={false} switchTo={activeTenant.role === "karyawan" ? undefined : "dashboard"} />
        </header>
        <main className="flex flex-col gap-3.5">{children}</main>
      </div>
      <PortalBottomNav inactive={inactive} />
    </>
  );
}
