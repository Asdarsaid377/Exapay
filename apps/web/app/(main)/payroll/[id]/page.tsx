import { CloudOff, Users } from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import { Badge } from "@/components/common/Badge";
import { Banner } from "@/components/common/Banner";
import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayrollBackLink } from "@/components/payroll/PayrollBackLink";
import { PayrollRunEmployeeTable } from "@/components/payroll/PayrollRunEmployeeTable";
import { fetchPayrollRun } from "@/lib/api/payrollRuns";
import { RUN_STATUS_LABELS, RUN_STATUS_TONES, rupiahNumber, runPeriodSummary, runTitle } from "@/lib/payrollRunLabels";

export const metadata: Metadata = { title: "Periode gaji — Exapay" };

type Props = {
  params: Promise<{ id: string }>;
};

// Draf payroll satu periode (feature 29): total + daftar per karyawan; rincian & penyesuaian per karyawan di sub-halaman.
// Tanpa referensi desain — pola /kpi/reviews + /attendance (StatTile + tabel glass-data) (izin user).
export default async function PayrollRunPage({ params }: Props) {
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  const result = parsedId.success ? await fetchPayrollRun(parsedId.data) : ({ ok: false, error: "Periode payroll tidak ditemukan" } as const);

  if (!result.ok) {
    return (
      <>
        <PayrollBackLink href="/payroll" label="Periode gaji" />
        <EmptyState icon={CloudOff} title="Periode gaji tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const run = result.data;
  const { totals } = run;
  const pending = run.rows.filter((row) => row.status === "no_salary" || row.status === "error").length;
  const excluded = run.rows.filter((row) => row.status === "excluded").length;

  return (
    <>
      <PayrollBackLink href="/payroll" label="Periode gaji" />
      <PageHeader title={runTitle(run)} description={runPeriodSummary(run)} actions={<Badge tone={RUN_STATUS_TONES[run.status]}>{RUN_STATUS_LABELS[run.status]}</Badge>} />

      {run.warnings.length > 0 ? (
        <Banner
          tone="warning"
          title="Perlu diperhatikan"
          description={
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {run.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          }
        />
      ) : null}
      {pending > 0 ? (
        <Banner
          tone="danger"
          title={`${pending} karyawan belum bisa dihitung`}
          description="Buka barisnya untuk melihat penyebabnya — biasanya gaji belum diatur di tab Gaji karyawan."
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <StatTile label="Pendapatan bruto (Rp)" value={rupiahNumber(totals.grossPay)} note={`${totals.employeeCount} karyawan dihitung`} />
        <StatTile label="BPJS perusahaan (Rp)" value={rupiahNumber(totals.bpjsEmployer)} note={`Potongan karyawan Rp ${rupiahNumber(totals.bpjsEmployee)}`} />
        <StatTile label="PPh 21 (Rp)" value={rupiahNumber(totals.pph21)} note="Dipotong dari gaji" />
        <StatTile label="Gaji diterima (Rp)" value={rupiahNumber(totals.takeHomePay)} note="Total transfer ke karyawan" />
      </div>

      {run.rows.length === 0 ? (
        <EmptyState icon={Users} title="Tidak ada karyawan di periode ini" description="Karyawan yang bekerja di bulan ini akan muncul di sini." />
      ) : (
        <PayrollRunEmployeeTable
          runId={run.id}
          rows={run.rows}
          footer={
            <p className="text-small text-pretty text-text-secondary tabular-nums">
              {run.rows.length} karyawan{excluded > 0 ? ` · ${excluded} dikeluarkan` : ""} · draf dihitung ulang setiap dibuka dari gaji, absensi, dan penyesuaian terbaru
            </p>
          }
        />
      )}
    </>
  );
}
