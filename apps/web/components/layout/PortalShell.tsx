import type { SessionUser, TenantMembership } from "@exapay/shared";
import type { ReactNode } from "react";

import { PortalBottomNav } from "@/components/layout/PortalBottomNav";
import { TenantSwitcher } from "@/components/layout/TenantSwitcher";
import { UserMenu } from "@/components/layout/UserMenu";

type Props = {
  user: SessionUser;
  activeTenant: TenantMembership;
  tenants: TenantMembership[];
  children: ReactNode;
};

// Kerangka portal karyawan /me: header ringkas di atas, bottom nav di bawah, konten selebar HP.
export function PortalShell({ user, activeTenant, tenants, children }: Props) {
  return (
    <div className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-2 px-2">
          <TenantSwitcher activeTenant={activeTenant} tenants={tenants} />
          <div className="ml-auto shrink-0 pr-2">
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-6">{children}</main>
      <PortalBottomNav />
    </div>
  );
}
