import type { KpiScoreRow } from "@exapay/shared";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/common/Badge";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { KpiIndicatorBreakdown } from "@/components/kpi/KpiIndicatorBreakdown";
import { formatScore, PREDICATE_TONES, predicateLabel } from "@/lib/kpiScoreLabels";

type Props = {
  rows: KpiScoreRow[];
  footer?: ReactNode;
};

const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_9.5rem_1.25rem]";

function EmployeeCell({ row }: { row: KpiScoreRow }) {
  const inactive = row.employee.endDate !== null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <EmployeeAvatar fullName={row.employee.fullName} inactive={inactive} />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[14.5px] font-bold text-text-primary">{row.employee.fullName}</span>
        <span className="truncate text-caption text-text-tertiary">
          {row.employee.positionName} · {row.employee.departmentName}
          {inactive ? " · Nonaktif" : ""}
        </span>
      </div>
    </div>
  );
}

function ScoreCell({ row }: { row: KpiScoreRow }) {
  const score = row.result?.score ?? null;
  const predicate = row.result?.predicate ?? null;
  return (
    <>
      <span className={`text-right font-display text-[22px] leading-none font-extrabold tabular-nums max-lg:row-span-2 ${score ? "text-text-primary" : "text-text-tertiary"}`}>
        {score ? formatScore(score) : "–"}
      </span>
      <span className="max-lg:col-start-1 max-lg:row-start-2 max-lg:pl-12">
        {predicate ? (
          <Badge tone={PREDICATE_TONES[predicate]}>{predicateLabel(predicate)}</Badge>
        ) : (
          <span className="text-caption text-text-tertiary">{row.template ? "Belum ada skor" : "Belum ada template KPI"}</span>
        )}
      </span>
    </>
  );
}

// Skor per karyawan (feature 21): baris ringkas (karyawan · template · skor · predikat), dibuka untuk rincian per indikator.
// Karyawan tanpa template tidak bisa dibuka. Satu render untuk desktop & mobile (grid menyesuaikan).
// Tanpa referensi desain — pola AttendanceRecapTable (glass-data) + badge predikat snapshot dashboard.html (izin user).
export function KpiScoreList({ rows, footer }: Props) {
  return (
    <section className="overflow-hidden rounded-card glass-data">
      <div className={`${ROW_GRID} hidden h-11 border-b border-border-subtle bg-table-head py-0 text-caption font-bold text-text-secondary lg:grid`}>
        <span>Karyawan</span>
        <span>Template KPI</span>
        <span className="text-right">Skor</span>
        <span>Predikat</span>
        <span className="sr-only">Rincian</span>
      </div>
      <ul>
        {rows.map((row) => (
          <li key={row.employee.id} className="border-t border-border-subtle first:border-t-0">
            {row.result ? (
              <details className="group">
                <summary
                  className={`${ROW_GRID} min-h-16 cursor-pointer list-none transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none [&::-webkit-details-marker]:hidden`}
                >
                  <EmployeeCell row={row} />
                  <span className="hidden truncate text-small text-text-secondary lg:block">{row.template?.name}</span>
                  <ScoreCell row={row} />
                  <ChevronDown aria-hidden className="hidden size-5 text-text-secondary transition-transform group-open:rotate-180 lg:block" />
                </summary>
                <div className="px-4 pb-4 sm:px-5">
                  <div className="rounded-inner bg-fill-subtle px-4 pt-1 pb-2.5">
                    <p className="pt-3 text-caption text-text-tertiary lg:hidden">Template {row.template?.name}</p>
                    <KpiIndicatorBreakdown result={row.result} />
                  </div>
                </div>
              </details>
            ) : (
              <div className={`${ROW_GRID} min-h-16`}>
                <EmployeeCell row={row} />
                <span className="hidden text-small text-text-tertiary lg:block">–</span>
                <ScoreCell row={row} />
                <span className="hidden lg:block" />
              </div>
            )}
          </li>
        ))}
      </ul>
      {footer ? <div className="border-t border-border-subtle px-4 py-3 sm:px-5">{footer}</div> : null}
    </section>
  );
}
