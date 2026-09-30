import type { KpiReviewRow } from "@exapay/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { formatScore, PREDICATE_TONES, predicateLabel } from "@/lib/kpiScoreLabels";
import { REVIEW_STATUS_TONES, reviewStatusLabel } from "@/lib/kpiReviewLabels";

type Props = {
  rows: KpiReviewRow[];
  footer?: ReactNode;
};

const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_6rem_9.5rem_1.25rem]";

function subtitle(row: KpiReviewRow): string {
  if (row.status === "final") return "Skor final terkunci";
  if (!row.templateName) return "Jabatan belum memakai template KPI";
  if (row.unratedCount > 0) return `${row.unratedCount} indikator belum dinilai`;
  return row.status === "reviewed" ? "Menunggu difinalkan" : "Nilai lengkap, belum dikirim";
}

// Daftar penilaian satu periode (feature 22): karyawan · template · status · skor · predikat, tiap baris membuka detail.
// Tanpa referensi desain — pola KpiScoreList (glass-data) + badge status ui-rules (izin user).
export function KpiReviewList({ rows, footer }: Props) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <div className={`${ROW_GRID} hidden h-11 border-b border-border-subtle bg-table-head py-0 text-caption font-bold text-text-secondary lg:grid`}>
        <span>Karyawan</span>
        <span>Template KPI</span>
        <span>Status</span>
        <span className="text-right">Skor</span>
        <span>Predikat</span>
        <span className="sr-only">Buka</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.id} className="border-t border-border-subtle first:border-t-0">
            <Link
              href={`/kpi/reviews/${row.id}`}
              className={`${ROW_GRID} min-h-16 transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <EmployeeAvatar fullName={row.employee.fullName} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14.5px] font-bold text-text-primary">{row.employee.fullName}</span>
                  <span className="truncate text-caption text-text-tertiary">
                    {row.employee.positionName} · {subtitle(row)}
                  </span>
                </div>
              </div>
              <span className="hidden truncate text-small text-text-secondary lg:block">{row.templateName ?? "–"}</span>
              <span className="hidden lg:block">
                <Badge tone={REVIEW_STATUS_TONES[row.status]}>{reviewStatusLabel(row.status)}</Badge>
              </span>
              <span
                className={`text-right font-display text-[22px] leading-none font-extrabold tabular-nums max-lg:row-span-2 ${row.score ? "text-text-primary" : "text-text-tertiary"}`}
              >
                {row.score ? formatScore(row.score) : "–"}
              </span>
              <span className="flex flex-wrap gap-1.5 max-lg:col-start-1 max-lg:row-start-2 max-lg:pl-12">
                <span className="lg:hidden">
                  <Badge tone={REVIEW_STATUS_TONES[row.status]}>{reviewStatusLabel(row.status)}</Badge>
                </span>
                {row.predicate ? <Badge tone={PREDICATE_TONES[row.predicate]}>{predicateLabel(row.predicate)}</Badge> : null}
              </span>
              <ChevronRight aria-hidden className="hidden size-5 text-text-secondary lg:block" />
            </Link>
          </li>
        ))}
      </ul>
      {footer ? <div className="border-t border-border-subtle px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  );
}
