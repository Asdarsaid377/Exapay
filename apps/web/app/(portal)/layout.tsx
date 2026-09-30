import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PortalShell } from "@/components/layout/PortalShell";
import { getSession } from "@/lib/auth/getSession";

type Props = {
  children: ReactNode;
};

// Portal karyawan. Semua anggota usaha aktif boleh membuka /me (proxy); redirect di sini hanya cadangan.
export default async function PortalLayout({ children }: Props) {
  const session = await getSession();
  const activeTenant = session?.activeTenant;
  if (!session || !activeTenant) redirect("/login");

  return (
    <PortalShell user={session.user} activeTenant={activeTenant} tenants={session.tenants}>
      {children}
    </PortalShell>
  );
}
