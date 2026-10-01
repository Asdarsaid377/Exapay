import { formatRupiah, type PayrollReport } from "@exapay/shared";
import { Download } from "lucide-react";
import Link from "next/link";

import { runHref, runPeriodSummary, runTitle } from "@/lib/payrollRunLabels";

type Props = {
  report: PayrollReport;
};

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_repeat(5,minmax(0,0.9fr))_minmax(0,1.1fr)]";
const MONEY = "text-right font-display text-[15px] font-bold whitespace-nowrap tabular-nums";
const DOWNLOAD =
  "-my-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold whitespace-nowrap text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Rekap periode final satu tahun (feature 32): bruto · BPJS perusahaan · BPJS karyawan · PPh 21 · diterima + unduh Excel
// transfer bank & rekap setor per periode; baris total di bawah. Tanpa referensi desain — pola PayrollRunEmployeeTable
// (glass-data, thead table-head) (izin user).
export function PayrollReportTable({ report }: Props) {
  const { totals } = report;
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <div className={`${ROW_GRID} hidden h-11 border-b border-border-subtle bg-table-head py-0 text-caption font-bold text-text-secondary lg:grid`}>
        <span>Periode</span>
        <span className="text-right">Pendapatan bruto</span>
        <span className="text-right">BPJS perusahaan</span>
        <span className="text-right">BPJS karyawan</span>
        <span className="text-right">PPh 21</span>
        <span className="text-right">Gaji diterima</span>
        <span className="text-right">Ekspor Excel</span>
      </div>
      <ul>
        {report.months.map((month) => {
          const yearQuery = `?year=${report.year}`;
          return (
            <li key={month.runId} className={`${ROW_GRID} min-h-16 border-t border-border-subtle first:border-t-0`}>
              <div className="flex min-w-0 flex-col">
                <Link href={runHref(month.runId)} className="truncate text-[15px] font-bold text-text-primary hover:text-accent-strong hover:underline">
                  {runTitle(month)}
                </Link>
                <span className="text-caption text-pretty text-text-tertiary tabular-nums">
                  {month.totals.employeeCount} slip · {runPeriodSummary(month)}
                </span>
              </div>
              <span className={`${MONEY} hidden text-text-secondary lg:block`}>{formatRupiah(month.totals.grossPay)}</span>
              <span className={`${MONEY} hidden text-text-secondary lg:block`}>{formatRupiah(month.totals.bpjsEmployer)}</span>
              <span className={`${MONEY} hidden text-text-secondary lg:block`}>{formatRupiah(month.totals.bpjsEmployee)}</span>
              <span className={`${MONEY} hidden text-text-secondary lg:block`}>{formatRupiah(month.totals.pph21)}</span>
              <span className={`${MONEY} text-text-primary lg:text-[16px]`}>{formatRupiah(month.totals.takeHomePay)}</span>
              <span className="col-span-2 flex flex-wrap gap-x-5 gap-y-1 lg:col-span-1 lg:flex-col lg:items-end lg:gap-y-0">
                <a href={`/payroll/reports/${month.runId}/transfer${yearQuery}`} className={DOWNLOAD}>
                  <Download aria-hidden className="size-4 shrink-0" />
                  Transfer bank
                </a>
                <a href={`/payroll/reports/${month.runId}/contributions${yearQuery}`} className={DOWNLOAD}>
                  <Download aria-hidden className="size-4 shrink-0" />
                  Rekap setor
                </a>
              </span>
            </li>
          );
        })}
      </ul>
      <div className={`${ROW_GRID} border-t border-border-subtle bg-table-head`}>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold text-text-primary">Total {report.year}</span>
          <span className="text-caption text-text-tertiary tabular-nums">
            {report.months.length} periode · {totals.employeeCount} slip
          </span>
        </div>
        <span className={`${MONEY} hidden text-text-primary lg:block`}>{formatRupiah(totals.grossPay)}</span>
        <span className={`${MONEY} hidden text-text-primary lg:block`}>{formatRupiah(totals.bpjsEmployer)}</span>
        <span className={`${MONEY} hidden text-text-primary lg:block`}>{formatRupiah(totals.bpjsEmployee)}</span>
        <span className={`${MONEY} hidden text-text-primary lg:block`}>{formatRupiah(totals.pph21)}</span>
        <span className={`${MONEY} text-text-primary lg:text-[16px]`}>{formatRupiah(totals.takeHomePay)}</span>
        <span className="hidden lg:block" />
      </div>
    </section>
  );
}
