import { formatRupiah, type PayrollRunRow } from "@exapay/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUS_TONES, employeeHref, minusRupiah } from "@/lib/payrollRunLabels";

type Props = {
  runId: string;
  rows: PayrollRunRow[];
  footer?: ReactNode;
};

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))_1.25rem]";
const MONEY = "text-right font-display text-[15px] font-bold whitespace-nowrap tabular-nums";

function subtitle(row: PayrollRunRow): string {
  const parts = [row.employee.positionName];
  // Gaji belum diatur sudah dijelaskan badge; alasan dikeluarkan / pesan gagal ditampilkan
  if ((row.status === "excluded" || row.status === "error") && row.message) parts.push(row.message);
  if (row.adjustmentCount > 0) parts.push(`${row.adjustmentCount} penyesuaian`);
  return parts.join(" · ");
}

// Draf per karyawan dalam satu periode (feature 29): bruto · potongan · PPh 21 · diterima, tiap baris membuka rincian.
// Tanpa referensi desain — pola AttendanceRecapTable/KpiReviewList (glass-data, thead table-head) (izin user).
export function PayrollRunEmployeeTable({ runId, rows, footer }: Props) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <div className={`${ROW_GRID} hidden h-11 border-b border-border-subtle bg-table-head py-0 text-caption font-bold text-text-secondary lg:grid`}>
        <span>Karyawan</span>
        <span className="text-right">Pendapatan bruto</span>
        <span className="text-right">Potongan</span>
        <span className="text-right">PPh 21</span>
        <span className="text-right">Gaji diterima</span>
        <span className="sr-only">Buka</span>
      </div>
      <ul>
        {rows.map((row) => {
          const calculated = row.status === "calculated";
          return (
            <li key={row.employee.id} className="border-t border-border-subtle first:border-t-0">
              <Link
                href={employeeHref(runId, row.employee.id)}
                className={`${ROW_GRID} min-h-16 transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <EmployeeAvatar fullName={row.employee.fullName} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[14.5px] font-bold text-text-primary">{row.employee.fullName}</span>
                    <span className="truncate text-caption text-text-tertiary">{subtitle(row)}</span>
                  </div>
                </div>
                <span className={`${MONEY} hidden text-text-secondary lg:block`}>{row.grossPay ? formatRupiah(row.grossPay) : "–"}</span>
                <span className={`${MONEY} hidden text-text-secondary lg:block`}>{row.totalDeductions ? minusRupiah(row.totalDeductions) : "–"}</span>
                <span className={`${MONEY} hidden text-text-secondary lg:block`}>{row.pph21 ? minusRupiah(row.pph21) : "–"}</span>
                <span className={`${MONEY} max-lg:row-span-2 lg:text-[17px] ${calculated ? "text-text-primary" : "text-text-tertiary"}`}>
                  {row.takeHomePay ? formatRupiah(row.takeHomePay) : "–"}
                </span>
                <ChevronRight aria-hidden className="hidden size-5 text-text-secondary lg:block" />
                {!calculated || row.warningCount > 0 ? (
                  <span className="flex flex-wrap gap-1.5 pl-12 lg:col-span-6 lg:-mt-1 lg:pb-1">
                    {!calculated ? <Badge tone={EMPLOYEE_STATUS_TONES[row.status]}>{EMPLOYEE_STATUS_LABELS[row.status]}</Badge> : null}
                    {row.warningCount > 0 ? <Badge tone="warning">{`${row.warningCount} catatan`}</Badge> : null}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      {footer ? <div className="border-t border-border-subtle px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  );
}
