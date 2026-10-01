import { payrollReportYearSchema } from "@exapay/shared";
import { CloudOff, FileSpreadsheet } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { StatTile } from "@/components/common/StatTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayrollReportTable } from "@/components/payroll/PayrollReportTable";
import { PayrollReportYearNav } from "@/components/payroll/PayrollReportYearNav";
import { fetchPayrollReport } from "@/lib/api/payrollReports";
import { rupiahNumber } from "@/lib/payrollRunLabels";

export const metadata: Metadata = { title: "Laporan payroll — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTION = "Rekap payroll final per tahun dan ekspor Excel untuk transfer gaji & setoran BPJS/PPh 21.";

// Laporan & ekspor payroll (feature 32): rekap periode final satu tahun (angka = jumlah slip) + unduh Excel per periode.
// Tanpa referensi desain — pola /payroll/[id] (StatTile + tabel glass-data) (izin user).
export default async function PayrollReportsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const requested = payrollReportYearSchema.safeParse(typeof raw.year === "string" ? raw.year : undefined);
  const result = await fetchPayrollReport(requested.success ? requested.data : null);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Laporan payroll" description={DESCRIPTION} />
        <EmptyState icon={CloudOff} title="Laporan tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const report = result.data;
  const { totals } = report;
  return (
    <>
      <PageHeader title="Laporan payroll" description={DESCRIPTION} />
      {raw.export === "error" ? <FormAlert tone="danger">File Excel tidak dapat dibuat. Coba lagi beberapa saat lagi.</FormAlert> : null}
      <PayrollReportYearNav year={report.year} years={report.years} />

      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <StatTile label="Pendapatan bruto (Rp)" value={rupiahNumber(totals.grossPay)} note={`${report.months.length} periode final · ${totals.employeeCount} slip`} />
        <StatTile label="BPJS perusahaan (Rp)" value={rupiahNumber(totals.bpjsEmployer)} note={`Potongan karyawan Rp ${rupiahNumber(totals.bpjsEmployee)}`} />
        <StatTile label="PPh 21 (Rp)" value={rupiahNumber(totals.pph21)} note="Dipotong dari gaji" />
        <StatTile label="Gaji diterima (Rp)" value={rupiahNumber(totals.takeHomePay)} note="Total transfer ke karyawan" />
      </div>

      {report.months.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title={`Belum ada payroll final di ${report.year}`}
          description="Laporan dan ekspor Excel tersedia setelah payroll periode difinalisasi."
        />
      ) : (
        <PayrollReportTable report={report} />
      )}
      <p className="px-1.5 text-small text-pretty text-text-secondary">
        Angka dari snapshot payroll final (karyawan yang dihitung) — sama dengan jumlah slip gaji. File transfer bank memuat nomor rekening lengkap
        dari data karyawan saat diunduh dan tercatat di log audit.
      </p>
    </>
  );
}
