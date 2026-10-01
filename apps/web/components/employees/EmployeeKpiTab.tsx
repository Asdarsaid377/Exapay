import type { EmployeeKpiReview, EmployeeKpiScore } from "@exapay/shared";
import { ChevronRight, ClipboardCheck, CloudOff, Target } from "lucide-react";
import Link from "next/link";

import { AttendanceMonthNav } from "@/components/attendance/AttendanceMonthNav";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { KpiIndicatorBreakdown } from "@/components/kpi/KpiIndicatorBreakdown";
import type { ApiResult } from "@/lib/api/server";
import { REVIEW_STATUS_TONES, cycleLabel, reviewPeriodLabel, reviewPeriodRange, reviewStatusLabel } from "@/lib/kpiReviewLabels";
import { formatScore, PREDICATE_TONES, predicateLabel } from "@/lib/kpiScoreLabels";
import { formatDateRange } from "@/lib/leaveLabels";

type Props = {
  employeeId: string;
  firstName: string;
  score: ApiResult<EmployeeKpiScore>;
  reviews: ApiResult<EmployeeKpiReview[]>;
};

// Skor bulan terpilih + rincian indikator (rumus /kpi/scores, feature 21)
function MonthlyScore({ employeeId, firstName, score }: { employeeId: string; firstName: string; score: EmployeeKpiScore }) {
  const nav = <AttendanceMonthNav month={score.month} currentMonth={score.currentMonth} basePath={`/employees/${employeeId}?tab=kpi`} />;
  if (!score.template || !score.result) {
    return (
      <>
        {nav}
        <EmptyState
          icon={Target}
          title="Jabatan belum punya template KPI"
          description={`Skor ${firstName} dihitung dari template KPI jabatannya. Pasang template di menu KPI → Template KPI.`}
        />
      </>
    );
  }
  const result = score.result;
  const scoredCount = result.indicators.filter((indicator) => indicator.status === "scored").length;
  return (
    <>
      {nav}
      <section aria-labelledby="employee-kpi-score-title" className="glass-data flex flex-col rounded-card px-4.5 pt-4.5 pb-2.5 lg:px-6 lg:pt-5.5">
        <h2 id="employee-kpi-score-title" className="text-[13px] text-text-secondary">
          Skor · {formatDateRange(score.from, score.to)}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] text-text-primary tabular-nums">
            {result.score ? formatScore(result.score) : "–"}
          </span>
          {result.predicate ? <Badge tone={PREDICATE_TONES[result.predicate]}>{predicateLabel(result.predicate)}</Badge> : null}
        </div>
        <span className="mt-2 mb-2 text-[12.5px] text-text-tertiary">
          Template {score.template.name} · {scoredCount} dari {result.indicators.length} indikator dihitung
        </span>
        <KpiIndicatorBreakdown result={result} />
      </section>
    </>
  );
}

// Riwayat penilaian periodik karyawan, terbaru dulu — tiap baris membuka /kpi/reviews/[id]
function ReviewHistory({ firstName, reviews }: { firstName: string; reviews: EmployeeKpiReview[] }) {
  if (reviews.length === 0) {
    return <EmptyState icon={ClipboardCheck} surface="none" title="Belum ada penilaian" description={`Penilaian periodik ${firstName} muncul di sini setelah periode penilaian dibuat.`} />;
  }
  return (
    <ul>
      {reviews.map((review) => (
        <li key={review.id} className="border-t border-border-subtle first:border-t-0">
          <Link
            href={`/kpi/reviews/${review.id}`}
            className="flex min-h-16 items-center gap-3 px-4.5 py-3 transition-colors hover:bg-row-hover focus-visible:bg-row-hover focus-visible:outline-none lg:px-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[14.5px] font-bold text-text-primary">{reviewPeriodLabel(review.period.cycle, review.period)}</span>
              <span className="text-small text-text-secondary tabular-nums">
                {cycleLabel(review.period.cycle)}
                {review.period.cycle === "weekly" ? "" : ` · ${reviewPeriodRange(review.period)}`}
              </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {review.status === "final" ? (
                <>
                  <span className="font-display text-[17px] font-extrabold text-text-primary tabular-nums">{review.score ? formatScore(review.score) : "–"}</span>
                  {review.predicate ? <Badge tone={PREDICATE_TONES[review.predicate]}>{predicateLabel(review.predicate)}</Badge> : null}
                </>
              ) : (
                <Badge tone={REVIEW_STATUS_TONES[review.status]}>{reviewStatusLabel(review.status)}</Badge>
              )}
            </div>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-text-secondary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

// Tab KPI detail karyawan (feature 37b): skor bulanan (bulan kalender, s.d. hari ini) + riwayat penilaian periodik.
// Tanpa referensi desain tab ini — pola /me/performance (navigasi bulan + skor + KpiIndicatorBreakdown) dan baris daftar
// /kpi/reviews di card glass-data, izin user.
export function EmployeeKpiTab({ employeeId, firstName, score, reviews }: Props) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        {score.ok ? (
          <MonthlyScore employeeId={employeeId} firstName={firstName} score={score.data} />
        ) : (
          <EmptyState icon={CloudOff} title="Skor KPI tidak dapat dimuat" description={score.error} />
        )}
      </div>
      <section aria-labelledby="employee-kpi-reviews-title" className="glass-data flex min-w-0 flex-col rounded-card">
        <h2 id="employee-kpi-reviews-title" className="px-4.5 pt-4.5 pb-2 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary lg:px-6 lg:pt-5.5">
          Penilaian periodik
        </h2>
        {reviews.ok ? (
          <ReviewHistory firstName={firstName} reviews={reviews.data} />
        ) : (
          <EmptyState icon={CloudOff} surface="none" title="Penilaian tidak dapat dimuat" description={reviews.error} />
        )}
      </section>
    </div>
  );
}
