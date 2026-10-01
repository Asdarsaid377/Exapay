import type { MyKpiReview } from "@exapay/shared";
import { ChevronDown } from "lucide-react";

import { Badge } from "@/components/common/Badge";
import { KpiIndicatorBreakdown } from "@/components/kpi/KpiIndicatorBreakdown";
import { formatShortDate } from "@/lib/datetime";
import { cycleLabel, reviewPeriodLabel, reviewPeriodRange } from "@/lib/kpiReviewLabels";
import { formatScore, PREDICATE_TONES, predicateLabel } from "@/lib/kpiScoreLabels";

type Props = {
  reviews: MyKpiReview[];
};

// Penilaian periodik FINAL milik sendiri di /me/performance (feature 37): satu card solid per periode — skor final +
// predikat, catatan kinerja (narasi yang sudah ditinjau atasan), rincian indikator terlipat. Tanpa referensi desain bagian
// ini — pola KpiMyScoreCard + baris terlipat KpiScoreList (izin user).
export function MyKpiReviewList({ reviews }: Props) {
  return (
    <ul className="flex flex-col gap-3">
      {reviews.map((review) => {
        const range = reviewPeriodRange(review.period);
        const title = reviewPeriodLabel(review.period.cycle, review.period);
        return (
          <li key={review.id} className="surface-solid flex flex-col gap-3 rounded-card p-4.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <h3 className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">{title}</h3>
                <span className="text-small text-text-secondary tabular-nums">
                  {cycleLabel(review.period.cycle)}
                  {review.period.cycle === "weekly" ? "" : ` · ${range}`}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">
                  {review.result.score ? formatScore(review.result.score) : "–"}
                </span>
                {review.result.predicate ? <Badge tone={PREDICATE_TONES[review.result.predicate]}>{predicateLabel(review.result.predicate)}</Badge> : null}
              </div>
            </div>

            {review.summary ? (
              <div className="flex flex-col gap-1.5 rounded-inner bg-fill-subtle px-4 py-3">
                <span className="text-[13px] font-bold text-text-primary">Catatan kinerja</span>
                <p className="text-sm whitespace-pre-line text-text-primary text-pretty">{review.summary.body}</p>
              </div>
            ) : null}

            <details className="group border-t border-border-subtle">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 pt-2 text-sm font-bold text-accent-strong hover:text-accent-hover focus-visible:outline-none focus-visible:underline [&::-webkit-details-marker]:hidden">
                Rincian indikator
                <ChevronDown aria-hidden className="size-4.5 transition-transform group-open:rotate-180" />
              </summary>
              <KpiIndicatorBreakdown result={review.result} />
            </details>

            <span className="text-caption text-text-tertiary">
              Template {review.templateName} · difinalkan {formatShortDate(review.finalizedAt)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
