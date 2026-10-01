import { formatRupiah, type PayslipRow } from "@exapay/shared";
import { FileText } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { ResendPayslipEmailButton } from "@/components/payroll/ResendPayslipEmailButton";
import { formatShortDate } from "@/lib/datetime";
import { EMAIL_STATUS_LABELS, emailSummary, PAYSLIP_STATUS_LABELS, PAYSLIP_STATUS_TONES, staffPayslipPdfHref } from "@/lib/payslipLabels";

type Props = {
  runId: string;
  rows: PayslipRow[];
  footer?: ReactNode;
};

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)]";

// Slip per karyawan satu periode final (feature 31): gaji diterima · status slip & terbit · email · aksi (buka PDF, kirim
// ulang email). Tanpa referensi desain — pola PayrollRunEmployeeTable (glass-data, thead table-head) (izin user).
export function PayslipTable({ runId, rows, footer }: Props) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <div className={`${ROW_GRID} hidden h-11 border-b border-border-subtle bg-table-head py-0 text-caption font-bold text-text-secondary lg:grid`}>
        <span>Karyawan</span>
        <span className="text-right">Gaji diterima</span>
        <span>Status</span>
        <span className="text-right">Aksi</span>
      </div>
      <ul>
        {rows.map((row) => {
          const ready = row.status === "ready";
          const canResend = row.publishedAt !== null && row.hasPortalAccount && row.email?.status !== "queued";
          return (
            <li key={row.id} className={`${ROW_GRID} min-h-16 border-t border-border-subtle first:border-t-0`}>
              <div className="flex min-w-0 items-center gap-3">
                <EmployeeAvatar fullName={row.employee.fullName} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14.5px] font-bold text-text-primary">{row.employee.fullName}</span>
                  <span className={`text-caption text-pretty ${row.email?.status === "failed" ? "text-danger-text" : "text-text-tertiary"}`}>
                    {[row.employee.employeeNumber, emailSummary(row)].filter(Boolean).join(" · ")}
                  </span>
                </div>
              </div>
              <span className="text-right font-display text-[15px] font-bold whitespace-nowrap text-text-primary tabular-nums lg:text-[16px]">
                {formatRupiah(row.takeHomePay)}
              </span>
              <span className="col-span-2 flex flex-wrap gap-1.5 pl-12 lg:col-span-1 lg:pl-0">
                {/* Siap → cukup status terbit; email terkirim dijelaskan di keterangan baris */}
                {!ready ? <Badge tone={PAYSLIP_STATUS_TONES[row.status]}>{PAYSLIP_STATUS_LABELS[row.status]}</Badge> : null}
                {row.publishedAt ? <Badge tone="success">{`Terbit ${formatShortDate(row.publishedAt)}`}</Badge> : ready ? <Badge tone="warning">Siap · belum terbit</Badge> : null}
                {row.email && row.email.status !== "sent" ? <Badge tone={row.email.status === "failed" ? "danger" : "neutral"}>{EMAIL_STATUS_LABELS[row.email.status]}</Badge> : null}
              </span>
              <span className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-1 pl-12 lg:col-span-1 lg:justify-end lg:pl-0">
                {row.status === "failed" && row.error ? <span className="text-caption text-danger-text">{row.error}</span> : null}
                {ready ? (
                  <a
                    href={staffPayslipPdfHref(runId, row.id)}
                    target="_blank"
                    rel="noopener"
                    className="-my-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                  >
                    <FileText aria-hidden className="size-4 shrink-0" />
                    Buka PDF
                  </a>
                ) : null}
                {canResend ? <ResendPayslipEmailButton runId={runId} payslipId={row.id} /> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {footer ? <div className="border-t border-border-subtle px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  );
}
