import type { KpiIndicatorScore, KpiScoreResult } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { achievementBarWidth, formatScore, indicatorActualLabel, indicatorTargetLabel } from "@/lib/kpiScoreLabels";
import { formatQuantity } from "@/lib/taskLogLabels";

type Props = {
  result: KpiScoreResult;
};

function IndicatorRow({ indicator }: { indicator: KpiIndicatorScore }) {
  const scored = indicator.status === "scored" && indicator.achievement !== null;
  const reached = scored && Number(indicator.achievement) >= 100;
  return (
    <li className="flex flex-col gap-2 border-t border-border-subtle py-3.5 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[14.5px] leading-[1.35] font-bold text-text-primary">{indicator.name}</span>
          <span className="text-caption text-text-tertiary">
            {indicatorTargetLabel(indicator)} · Bobot {indicator.weight}%
          </span>
        </div>
        {scored ? (
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="font-display text-[17px] font-extrabold text-text-primary tabular-nums">{formatScore(indicator.achievement ?? "0")}%</span>
            <span className="text-caption text-text-tertiary tabular-nums">{formatQuantity(indicator.points ?? "0")} poin</span>
          </div>
        ) : (
          <Badge tone="neutral">{indicator.status === "not_rated" ? "Belum dinilai" : "Tidak dihitung"}</Badge>
        )}
      </div>
      {scored ? (
        <div
          role="progressbar"
          aria-label={`Capaian ${indicator.name}`}
          aria-valuemin={0}
          aria-valuemax={120}
          aria-valuenow={Number(indicator.achievement)}
          className="h-2 overflow-hidden rounded-full bg-chart-track"
        >
          <div className={`h-full rounded-full ${reached ? "bg-success" : "bg-accent"}`} style={{ width: `${achievementBarWidth(indicator.achievement)}%` }} />
        </div>
      ) : null}
      <span className="text-[13px] text-text-secondary tabular-nums">{indicatorActualLabel(indicator)}</span>
    </li>
  );
}

// Rincian skor per indikator (feature 21): target (prorata), realisasi, capaian (maks. 120%), poin, lalu rumus skor —
// angka bisa dicek ulang dengan tangan. Dipakai /kpi/scores (di dalam baris karyawan) & /me/performance.
// Tanpa referensi desain — pola TaskIndicatorRow (snapshot me.html "Tugas hari ini") (izin user).
export function KpiIndicatorBreakdown({ result }: Props) {
  const { days } = result;
  return (
    <div className="flex flex-col">
      <ul>
        {result.indicators.map((indicator) => (
          <IndicatorRow key={indicator.id} indicator={indicator} />
        ))}
      </ul>
      <div className="flex flex-col gap-1 border-t border-border-subtle pt-3 pb-1 text-[13px] text-text-secondary tabular-nums">
        {result.score !== null ? (
          <p>
            Skor = {formatQuantity(result.pointTotal)} poin ÷ bobot dihitung {result.countedWeight}% × 100 ={" "}
            <span className="font-bold text-text-primary">{formatScore(result.score)}</span> (maks. 100)
          </p>
        ) : (
          <p>Belum ada indikator yang bisa dihitung di periode ini.</p>
        )}
        <p className="text-caption text-text-tertiary">
          {days.targetDays} hari target · hadir {days.present} · alpa {days.absent} · izin/sakit/cuti {days.leaveDays} · hanya catatan tugas yang disetujui
          atasan yang dihitung
        </p>
      </div>
    </div>
  );
}
