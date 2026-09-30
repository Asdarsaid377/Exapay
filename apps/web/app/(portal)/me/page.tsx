import { Clock } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSession } from "@/lib/auth/getSession";

export const metadata: Metadata = { title: "Beranda — Exapay" };

// Beranda portal karyawan (kerangka feature 06). Kartu absen dibangun di feature 14, tugas hari ini di 19.
export default async function PortalHomePage() {
  const session = await getSession();
  const firstName = session?.user.fullName.split(/\s+/)[0] ?? "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Halo, ${firstName}`} description={session?.activeTenant?.tenantName} />
      <EmptyState
        icon={Clock}
        title="Absen & tugas hari ini"
        description="Absen masuk/pulang dan daftar tugas harian Anda akan tampil di sini."
      />
    </div>
  );
}
