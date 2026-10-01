import { CloudOff, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { OpenPayrollRunButton } from "@/components/payroll/OpenPayrollRunButton";
import { PayrollRunList } from "@/components/payroll/PayrollRunList";
import { fetchPayrollRuns } from "@/lib/api/payrollRuns";

export const metadata: Metadata = { title: "Periode gaji — Exapay" };

// Run payroll (feature 29): daftar periode gaji per bulan + buka periode baru (owner/admin).
// Tanpa referensi desain — pola /kpi/reviews (izin user).
export default async function PayrollRunsPage() {
  const result = await fetchPayrollRuns();
  if (!result.ok) {
    return (
      <>
        <PageHeader title="Periode gaji" />
        <EmptyState icon={CloudOff} title="Periode gaji tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;
  return (
    <>
      <PageHeader
        title="Periode gaji"
        description="Satu periode per bulan. Draf dihitung dari gaji, absensi, aturan potongan, BPJS, dan PPh 21 yang berlaku — periksa lalu sesuaikan per karyawan."
        actions={<OpenPayrollRunButton months={list.openableMonths} />}
      />
      {list.runs.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Belum ada periode gaji"
          description="Buka periode bulan ini untuk melihat draf gaji semua karyawan. Pastikan gaji karyawan sudah diatur di tab Gaji."
        />
      ) : (
        <PayrollRunList runs={list.runs} />
      )}
    </>
  );
}
