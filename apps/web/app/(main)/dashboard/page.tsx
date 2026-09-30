import { ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSession } from "@/lib/auth/getSession";
import { firstNameOf, greetingFor } from "@/lib/datetime";

export const metadata: Metadata = { title: "Dashboard — Exapay" };

// Dashboard kosong (feature 06). Isi sesuai snapshot context/designs/dashboard.html (stat tile, grafik kehadiran,
// sebaran KPI, tindakan tertunda, pengingat kepatuhan, peringatan UMK) dibangun di feature 35/36.
export default async function DashboardPage() {
  const session = await getSession();
  const tenant = session?.activeTenant;
  const canManage = tenant?.role === "owner" || tenant?.role === "admin";

  return (
    <>
      <PageHeader
        title={`${greetingFor(new Date())}, ${firstNameOf(session?.user.fullName ?? "")}`}
        description={`Ringkasan ${tenant?.tenantName ?? "usaha Anda"} akan tampil di sini setelah data mulai tercatat.`}
      />
      <EmptyState
        icon={ChartNoAxesColumn}
        title="Belum ada data untuk diringkas"
        description="Biaya gaji, rekap kehadiran, skor kinerja, dan pengingat kepatuhan akan muncul setelah data karyawan dan absensi mulai tercatat."
        action={
          canManage ? (
            <Link href="/employees" className={buttonClassName()}>
              Tambah karyawan
            </Link>
          ) : null
        }
      />
    </>
  );
}
