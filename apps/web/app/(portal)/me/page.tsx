import { Clock } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSession } from "@/lib/auth/getSession";
import { firstNameOf, formatLongDate, greetingFor } from "@/lib/datetime";

export const metadata: Metadata = { title: "Beranda — Exapay" };

// Beranda portal karyawan (kerangka feature 06). Kartu absen (feature 14) & tugas hari ini (feature 19)
// mengikuti snapshot context/designs/me.html.
export default async function PortalHomePage() {
  const session = await getSession();
  const now = new Date();

  return (
    <>
      <PageHeader title={`${greetingFor(now)}, ${firstNameOf(session?.user.fullName ?? "")}`} description={formatLongDate(now)} />
      <EmptyState
        icon={Clock}
        title="Absen & tugas hari ini"
        description="Absen masuk/pulang dan daftar tugas harian Anda akan tampil di sini."
      />
    </>
  );
}
