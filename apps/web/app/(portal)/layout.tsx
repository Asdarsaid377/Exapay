import type { ReactNode } from "react";

import { SessionEnded } from "@/components/auth/SessionEnded";
import { PortalShell } from "@/components/layout/PortalShell";
import { getSession } from "@/lib/auth/getSession";

type Props = {
  children: ReactNode;
};

// Portal karyawan. Semua anggota usaha aktif boleh membuka /me (proxy); redirect di sini hanya cadangan.
export default async function PortalLayout({ children }: Props) {
  const session = await getSession();
  const activeTenant = session?.activeTenant;
  // Token masih terbaca proxy tapi API menolak sesi/usaha (mis. tenant dinonaktifkan) → akhiri sesi
  if (!session || !activeTenant) return <SessionEnded />;

  return (
    <PortalShell user={session.user} activeTenant={activeTenant} tenants={session.tenants}>
      {children}
    </PortalShell>
  );
}
