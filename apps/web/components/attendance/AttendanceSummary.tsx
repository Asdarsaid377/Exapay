import type { AttendanceHistory, MyLeaveRequests } from "@exapay/shared";

import { formatDuration } from "@/lib/attendanceLabels";

type Props = {
  summary: AttendanceHistory["summary"];
  // Hari kerja tertutup pengajuan disetujui (feature 15); null = tidak dapat dimuat
  leave: MyLeaveRequests["summary"] | null;
};

const TILE_CLASSES = "surface-solid flex min-w-0 flex-col gap-1.5 rounded-[20px] p-4";

function leaveNote(leave: MyLeaveRequests["summary"]): string {
  const parts = [
    leave.permit ? `Izin ${leave.permit}` : "",
    leave.sick ? `Sakit ${leave.sick}` : "",
    leave.leave ? `Cuti ${leave.leave}` : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Tidak ada";
}

// Ringkasan kehadiran bulan terpilih (pola tile "Kehadiran bulan ini" snapshot me.html). Alpa dari rekap absensi (feature 37).
export function AttendanceSummary({ summary, leave }: Props) {
  return (
    <div className={`grid gap-2.5 ${leave ? "grid-cols-3" : "grid-cols-2"}`}>
      <div className={TILE_CLASSES}>
        <span className="text-[13px] text-text-secondary">Hadir</span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">{summary.present}</span>
          <span className="text-[13px] font-bold text-text-primary">hari</span>
        </div>
        <span className="text-[12.5px] text-text-tertiary">{summary.absent > 0 ? `Alpa ${summary.absent} hari` : "Tanpa alpa"}</span>
      </div>
      <div className={TILE_CLASSES}>
        <span className="text-[13px] text-text-secondary">Telat</span>
        <div className="flex items-baseline gap-1.5">
          <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">{summary.late}</span>
          <span className="text-[13px] font-bold text-text-primary">kali</span>
        </div>
        <span className="text-[12.5px] text-text-tertiary">{summary.late > 0 ? `Total ${formatDuration(summary.lateMinutes)}` : "Tidak pernah telat"}</span>
      </div>
      {leave ? (
        <div className={TILE_CLASSES}>
          <span className="text-[13px] text-text-secondary">Izin & cuti</span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">{leave.permit + leave.sick + leave.leave}</span>
            <span className="text-[13px] font-bold text-text-primary">hari</span>
          </div>
          <span className="text-[12.5px] text-text-tertiary">{leaveNote(leave)}</span>
        </div>
      ) : null}
    </div>
  );
}
