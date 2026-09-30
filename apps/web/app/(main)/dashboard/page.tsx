import { ChartNoAxesColumn } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { getSession } from "@/lib/auth/getSession";

export const metadata: Metadata = { title: "Dashboard — Exapay" };

const primaryLinkClasses =
  "inline-flex items-center justify-center rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent shadow-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

// Dashboard kosong (feature 06). Ringkasan biaya gaji, kehadiran, KPI & pengingat dibangun di feature 35/36.
export default async function DashboardPage() {
  const session = await getSession();
  const firstName = session?.user.fullName.split(/\s+/)[0] ?? "";
  const tenant = session?.activeTenant;
  const canManage = tenant?.role === "owner" || tenant?.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description={`Selamat datang, ${firstName}. Ringkasan ${tenant?.tenantName ?? "usaha Anda"} akan tampil di sini.`} />
      <EmptyState
        icon={ChartNoAxesColumn}
        title="Belum ada data untuk diringkas"
        description="Biaya gaji, rekap kehadiran, skor kinerja, dan pengingat kepatuhan akan muncul setelah data karyawan dan absensi mulai tercatat."
        action={
          canManage ? (
            <Link href="/employees" className={primaryLinkClasses}>
              Tambah karyawan
            </Link>
          ) : null
        }
      />
    </div>
  );
}
