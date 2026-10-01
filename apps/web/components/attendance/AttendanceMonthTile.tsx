import type { AttendanceHistory } from "@exapay/shared";
import Link from "next/link";

type Props = {
  summary: AttendanceHistory["summary"];
  // Selebar grid saat tile skor tidak tampil (jabatan tanpa template KPI)
  wide: boolean;
};

// Tile "Kehadiran bulan ini" di beranda portal — snapshot context/designs/me.html (card solid 20px, angka J 800 30px +
// "hadir", catatan "1 telat · 0 alpa"). Membuka /me/attendance.
export function AttendanceMonthTile({ summary, wide }: Props) {
  return (
    <Link
      href="/me/attendance"
      className={`surface-solid flex min-w-0 ${wide ? "col-span-2" : ""} flex-col gap-1.5 rounded-[20px] p-4 transition-transform focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 active:scale-[0.99]`}
    >
      <span className="text-[13px] text-text-secondary">Kehadiran bulan ini</span>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[30px] leading-none font-extrabold text-text-primary tabular-nums">{summary.present}</span>
        <span className="text-[13px] font-bold text-text-primary">hadir</span>
      </div>
      <span className="text-[12.5px] text-text-tertiary tabular-nums">
        {summary.late} telat · {summary.absent} alpa
      </span>
    </Link>
  );
}
