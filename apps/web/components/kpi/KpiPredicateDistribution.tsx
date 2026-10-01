import { KPI_PREDICATES, type KpiScoreList } from "@exapay/shared";
import type { ReactNode } from "react";

import { PREDICATE_BAR_CLASSES, PREDICATE_RANGES, predicateLabel } from "@/lib/kpiScoreLabels";

type Props = {
  counts: KpiScoreList["predicateCounts"];
  subtitle: string;
  title?: string;
  // Tautan di kanan judul (dashboard: "Lihat skor")
  action?: ReactNode;
};

// Sebaran predikat KPI — mengikuti card "Sebaran predikat KPI" snapshot context/designs/dashboard.html
// (label + rentang, jumlah J 800 18px, bar 10px; lebar relatif terhadap predikat terbanyak).
export function KpiPredicateDistribution({ counts, subtitle, title = "Sebaran predikat", action }: Props) {
  const max = Math.max(1, ...KPI_PREDICATES.map((predicate) => counts[predicate]));
  return (
    <section aria-labelledby="kpi-distribution-title" className="glass-strong flex flex-col gap-5 rounded-card px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="kpi-distribution-title" className="font-display text-h2 font-bold tracking-[-0.01em] text-text-primary">
            {title}
          </h2>
          <span className="text-small text-text-secondary">{subtitle}</span>
        </div>
        {action}
      </div>
      <ul className="flex flex-1 flex-col justify-center gap-4">
        {KPI_PREDICATES.map((predicate) => (
          <li key={predicate} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold text-text-primary">
                {predicateLabel(predicate)} <span className="font-normal text-text-tertiary">{PREDICATE_RANGES[predicate]}</span>
              </span>
              <span className="font-display text-lg font-extrabold text-text-primary tabular-nums">{counts[predicate]}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-chart-track">
              <div className={`h-full rounded-full ${PREDICATE_BAR_CLASSES[predicate]}`} style={{ width: `${(counts[predicate] / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
