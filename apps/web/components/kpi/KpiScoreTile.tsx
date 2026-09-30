import type { MyKpiScore } from "@exapay/shared";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatScore, PREDICATE_TEXT_CLASSES, predicateLabel } from "@/lib/kpiScoreLabels";
import { formatDateRange } from "@/lib/leaveLabels";

type Props = {
  score: MyKpiScore;
};

// Tile "Skor bulan ini" di beranda portal — snapshot context/designs/me.html (card solid 20px, angka J 800 30px + predikat
// D 700 13px berwarna). Membuka /me/performance.
export function KpiScoreTile({ score }: Props) {
  const result = score.result;
  return (
    <Link
      href="/me/performance"
      className="surface-solid flex items-center gap-3 rounded-[20px] p-4 transition-transform focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 active:scale-[0.99]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] text-text-secondary">Skor bulan ini</span>
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">{result?.score ? formatScore(result.score) : "–"}</span>
          {result?.predicate ? <span className={`text-[13px] font-bold ${PREDICATE_TEXT_CLASSES[result.predicate]}`}>{predicateLabel(result.predicate)}</span> : null}
        </div>
        <span className="text-[12.5px] text-text-tertiary">{result?.score ? formatDateRange(score.from, score.to) : "Belum ada skor di bulan ini"}</span>
      </div>
      <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-accent-strong">
        Rincian
        <ChevronRight aria-hidden className="size-4.5" />
      </span>
    </Link>
  );
}
