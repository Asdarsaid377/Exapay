import type { KpiScoreResult } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { formatScore, PREDICATE_TONES, predicateLabel } from "@/lib/kpiScoreLabels";

type Props = {
  result: KpiScoreResult;
  templateName: string;
  period: string;
};

// Skor bulan terpilih di /me/performance — pola tile "Skor bulan ini" snapshot me.html, diperbesar (card solid:
// portal maks. 3 lapisan blur). Rincian per indikator di KpiIndicatorBreakdown.
export function KpiMyScoreCard({ result, templateName, period }: Props) {
  const scoredCount = result.indicators.filter((indicator) => indicator.status === "scored").length;
  return (
    <section aria-label="Skor KPI" className="surface-solid flex flex-col gap-2 rounded-[22px] p-4.5">
      <span className="text-[13px] text-text-secondary">Skor · {period}</span>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] text-text-primary tabular-nums">
          {result.score ? formatScore(result.score) : "–"}
        </span>
        {result.predicate ? <Badge tone={PREDICATE_TONES[result.predicate]}>{predicateLabel(result.predicate)}</Badge> : null}
      </div>
      <span className="text-[12.5px] text-text-tertiary">
        Template {templateName} · {scoredCount} dari {result.indicators.length} indikator dihitung
      </span>
    </section>
  );
}
