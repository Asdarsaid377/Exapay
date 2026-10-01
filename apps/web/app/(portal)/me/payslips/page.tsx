import { CloudOff, Receipt } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { MyPayslipList } from "@/components/payroll/MyPayslipList";
import { fetchMyPayslips } from "@/lib/api/payslips";

export const metadata: Metadata = { title: "Slip gaji — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTION = "Slip gaji Anda yang sudah diterbitkan perusahaan.";

// Slip gaji milik sendiri (feature 31) — hanya slip yang sudah diterbitkan owner/admin, terbaru di atas.
// Tanpa referensi desain halaman ini — pola /me/performance + kartu slip me.html (izin user).
export default async function MyPayslipsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const result = await fetchMyPayslips();

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Slip gaji" description={DESCRIPTION} />
        <EmptyState icon={CloudOff} surface="solid" title="Slip gaji tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const data = result.data;
  return (
    <>
      <PageHeader title="Slip gaji" description={DESCRIPTION} />
      {raw.pdf === "error" ? <FormAlert tone="danger">Slip tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}
      {data.access === "not_linked" ? (
        <FormAlert tone="info">Akun Anda belum tertaut ke data karyawan, jadi belum ada slip gaji. Hubungi admin usaha.</FormAlert>
      ) : data.payslips.length === 0 ? (
        <EmptyState icon={Receipt} surface="solid" title="Belum ada slip gaji" description="Slip akan muncul di sini setelah payroll diterbitkan perusahaan." />
      ) : (
        <MyPayslipList payslips={data.payslips} />
      )}
    </>
  );
}
