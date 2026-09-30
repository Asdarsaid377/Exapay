import type { AttendanceHistory } from "@exapay/shared";

import { formatDuration } from "@/lib/attendanceLabels";

type Props = {
  summary: AttendanceHistory["summary"];
};

const TILE_CLASSES = "surface-solid flex flex-col gap-1.5 rounded-[20px] p-4";

// Ringkasan kehadiran bulan terpilih (pola tile "Kehadiran bulan ini" snapshot me.html). Alpa & izin menyusul rekap (feature 15/16).
export function AttendanceSummary({ summary }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <div className={TILE_CLASSES}>
        <span className="text-[13px] text-text-secondary">Hadir</span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">{summary.present}</span>
          <span className="text-[13px] font-bold text-text-primary">hari</span>
        </div>
        <span className="text-[12.5px] text-text-tertiary">Hari dengan absen masuk</span>
      </div>
      <div className={TILE_CLASSES}>
        <span className="text-[13px] text-text-secondary">Telat</span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">{summary.late}</span>
          <span className="text-[13px] font-bold text-text-primary">kali</span>
        </div>
        <span className="text-[12.5px] text-text-tertiary">{summary.late > 0 ? `Total ${formatDuration(summary.lateMinutes)}` : "Tidak pernah telat"}</span>
      </div>
    </div>
  );
}
