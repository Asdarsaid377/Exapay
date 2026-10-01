import type { ReactNode } from "react";

import { SessionEnded } from "@/components/auth/SessionEnded";
import { PortalShell } from "@/components/layout/PortalShell";
import { getSession } from "@/lib/auth/getSession";
import { isInactiveEmployee } from "@/lib/portalAccess";

type Props = {
  children: ReactNode;
};

// Portal karyawan. Semua anggota usaha aktif boleh membuka /me (proxy); redirect di sini hanya cadangan.
export default async function PortalLayout({ children }: Props) {
  const session = await getSession();
  const activeTenant = session?.activeTenant;
  // Token masih terbaca proxy tapi API menolak sesi/usaha (mis. tenant dinonaktifkan) → akhiri sesi
  if (!session || !activeTenant) return <SessionEnded />;
  const inactive = await isInactiveEmployee();

  return (
    <PortalShell user={session.user} activeTenant={activeTenant} tenants={session.tenants} inactive={inactive}>
      {children}
    </PortalShell>
  );
}
