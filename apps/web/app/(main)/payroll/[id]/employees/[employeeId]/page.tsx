import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { Badge } from "@/components/common/Badge";
import { Banner } from "@/components/common/Banner";
import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayrollAdjustmentPanel } from "@/components/payroll/PayrollAdjustmentPanel";
import { PayrollBackLink } from "@/components/payroll/PayrollBackLink";
import { PayrollBreakdown } from "@/components/payroll/PayrollBreakdown";
import { fetchPayrollEmployee } from "@/lib/api/payrollRuns";
import { formatIsoDate } from "@/lib/datetime";
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONES, rupiahNumber, runHref, runTitle } from "@/lib/payrollRunLabels";

export const metadata: Metadata = { title: "Rincian gaji — Exapay" };

type Props = {
  params: Promise<{ id: string; employeeId: string }>;
};

// Rincian draf gaji satu karyawan di satu periode + penyesuaian admin (feature 29).
// Tanpa referensi desain — pola /kpi/reviews/[id] (StatTile + panel aksi kiri, rincian kanan) (izin user).
export default async function PayrollEmployeePage({ params }: Props) {
  const { id, employeeId } = await params;
  const ids = z.object({ id: z.uuid(), employeeId: z.uuid() }).safeParse({ id, employeeId });
  const result = ids.success ? await fetchPayrollEmployee(ids.data.id, ids.data.employeeId) : ({ ok: false, error: "Karyawan tidak ada di periode payroll ini" } as const);

  if (!result.ok) {
    return (
      <>
        <PayrollBackLink href={ids.success ? runHref(ids.data.id) : "/payroll"} label="Kembali ke periode" />
        <EmptyState icon={CloudOff} title="Rincian gaji tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const detail = result.data;
  const { employee, run } = detail;
  const meta = [employee.positionName, employee.departmentName, `PTKP ${employee.ptkpStatus}`].join(" · ");
  const employment =
    employee.joinDate > run.periodStart || (employee.endDate !== null && employee.endDate < run.periodEnd)
      ? ` · masa kerja ${formatIsoDate(employee.joinDate > run.periodStart ? employee.joinDate : run.periodStart)} – ${formatIsoDate(employee.endDate !== null && employee.endDate < run.periodEnd ? employee.endDate : run.periodEnd)}`
      : "";

  return (
    <>
      <PayrollBackLink href={runHref(run.id)} label={runTitle(run)} />
      <PageHeader
        title={employee.fullName}
        description={`${meta}${employment}`}
        actions={<Badge tone={EMPLOYEE_STATUS_TONES[detail.status]}>{EMPLOYEE_STATUS_LABELS[detail.status]}</Badge>}
      />

      {detail.status === "excluded" ? (
        <Banner tone="neutral" title="Dikeluarkan dari periode ini" description={detail.message ?? undefined} />
      ) : null}
      {detail.status === "no_salary" ? (
        <Banner
          tone="warning"
          title="Gaji belum diatur untuk periode ini"
          description="Atur gaji pokok, tunjangan, dan BPJS di tab Gaji karyawan. Draf langsung terhitung setelah disimpan."
          action={
            <Link href={`/employees/${employee.id}`} className="text-sm font-bold text-accent-strong hover:text-accent-hover">
              Buka data karyawan
            </Link>
          }
        />
      ) : null}
      {detail.status === "error" ? <Banner tone="danger" title="Gaji karyawan ini tidak bisa dihitung" description={detail.message ?? undefined} /> : null}
      {detail.warnings.length > 0 ? (
        <Banner
          tone="warning"
          title="Perlu diperhatikan"
          description={
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {detail.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          }
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-start lg:gap-4">
        <div className="flex flex-col gap-3 lg:gap-4">
          <StatTile
            label="Gaji diterima (Rp)"
            value={detail.takeHomePay ? rupiahNumber(detail.takeHomePay) : "–"}
            note={detail.status === "calculated" ? "Gaji bersih dikurangi PPh 21" : EMPLOYEE_STATUS_LABELS[detail.status]}
          />
          <PayrollAdjustmentPanel
            runId={run.id}
            employeeId={employee.id}
            employeeName={employee.fullName}
            status={detail.status}
            adjustments={detail.adjustments}
            salaryItems={detail.salary?.items ?? []}
            editable={run.status === "draft"}
          />
        </div>
        {detail.status === "calculated" ? (
          <PayrollBreakdown detail={detail} />
        ) : (
          <section className="glass-strong flex flex-col gap-1 rounded-card p-5 lg:p-6">
            <h2 className="font-display text-h2 font-bold text-text-primary">Rincian gaji</h2>
            <p className="py-4 text-small text-text-secondary">Rincian tampil setelah gaji karyawan ini bisa dihitung di periode ini.</p>
          </section>
        )}
      </div>
    </>
  );
}
