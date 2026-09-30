import type { TaskIndicatorDay } from "@exapay/shared";

import { Badge, type BadgeTone } from "@/components/common/Badge";
import { formatClockTime } from "@/lib/attendanceLabels";
import { dailyProgress, formatQuantity, targetLabel } from "@/lib/taskLogLabels";

type Props = {
  indicator: TaskIndicatorDay;
  timeZone: string;
};

type Status = { label: string; tone: BadgeTone; bar: string };

// Status gabungan entri indikator hari itu: ada yang ditolak → Ditolak; ada yang menunggu → Menunggu verifikasi
function statusOf(indicator: TaskIndicatorDay): Status {
  if (indicator.entryCount === 0) return { label: "Belum dicatat", tone: "neutral", bar: "bg-accent" };
  if (indicator.rejectedCount > 0) return { label: "Ditolak", tone: "danger", bar: "bg-danger" };
  if (indicator.pendingCount > 0) return { label: "Menunggu verifikasi", tone: "warning", bar: "bg-accent" };
  return { label: "Disetujui", tone: "success", bar: "bg-success" };
}

// Baris indikator di kartu "Tugas hari ini" (snapshot context/designs/me.html): nama + realisasi/target, bar (target harian),
// badge status + keterangan. Target mingguan/bulanan tanpa bar — diprorata per hari kerja saat skor dihitung (feature 21).
export function TaskIndicatorRow({ indicator, timeZone }: Props) {
  const status = statusOf(indicator);
  const daily = indicator.targetPeriod === "daily";
  const value = daily ? `${formatQuantity(indicator.total)} / ${formatQuantity(indicator.target)}` : formatQuantity(indicator.total);
  const progress = dailyProgress(indicator.total, indicator.target);
  const logged = indicator.lastLoggedAt
    ? `${indicator.entryCount} catatan · terakhir ${formatClockTime(indicator.lastLoggedAt, timeZone)}`
    : null;
  const note = daily ? [indicator.unit, logged].filter(Boolean).join(" · ") : [targetLabel(indicator.target, indicator.unit, indicator.targetPeriod), logged].filter(Boolean).join(" · ");

  return (
    <li className="flex flex-col gap-2.25 border-t border-border-subtle py-3.5 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[14.5px] leading-[1.35] font-bold text-text-primary">{indicator.name}</span>
        <span className="shrink-0 font-display text-[15px] font-extrabold text-text-primary tabular-nums">{value}</span>
      </div>
      {daily ? (
        <div
          role="progressbar"
          aria-label={`Realisasi ${indicator.name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-full bg-fill"
        >
          <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {note ? <span className="text-[13px] text-text-secondary">{note}</span> : null}
      </div>
    </li>
  );
}
