import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
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
  if (!session || !activeTenant) redirect("/login");
  if (activeTenant.role === "karyawan") redirect("/me");

  return (
    <AppShell
      user={session.user}
      activeTenant={activeTenant}
      tenants={session.tenants}
      sections={staffMenuFor(activeTenant.role)}
      todayLabel={formatLongDate(new Date())}
    >
      {children}
    </AppShell>
  );
}
