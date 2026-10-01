"use client";

import type { AttendanceDailyRecap } from "@exapay/shared";
import Link from "next/link";
import { useState } from "react";

import { formatDateRange } from "@/lib/leaveLabels";
import { formatIsoDate } from "@/lib/datetime";

type Props = {
  recap: AttendanceDailyRecap;
};

const LINK = "shrink-0 text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline";

// Label sumbu: tanggal pertama, tiap 7 hari, dan tanggal terakhir (snapshot: 1 · 8 · 15 · 22 · 30)
function showsLabel(index: number, total: number): boolean {
  return index === total - 1 || (index % 7 === 0 && total - 1 - index >= 3);
}

// Rekap kehadiran periode absensi berjalan (feature 35) — card "Rekap kehadiran" snapshot dashboard.html: panel detail
// tanggal terpilih di atas grafik batang bertumpuk (tepat waktu · telat · izin/sakit/cuti · alpa), batang non-aktif
// opacity .55, legenda + total. Total = halaman /attendance (hadir termasuk telat). Tinggi batang relatif terhadap
// jumlah karyawan terjadwal terbanyak; hari libur kosong. Batang = tombol agar tanggal bisa dipilih lewat keyboard.
export function AttendanceChartCard({ recap }: Props) {
  const { days, totals } = recap;
  const todayIndex = days.findIndex((day) => day.date === recap.today);
  const [active, setActive] = useState(todayIndex >= 0 ? todayIndex : days.length - 1);
  const max = Math.max(1, ...days.map((day) => day.expected));
  const selected = days[active];

  const legend = [
    { label: "Tepat waktu", className: "bg-chart-present", value: totals.present - totals.late },
    { label: "Telat", className: "bg-chart-late", value: totals.late },
    { label: "Izin/sakit/cuti", className: "bg-chart-leave", value: totals.leave },
    { label: "Alpa", className: "bg-chart-absent", value: totals.absent },
  ];

  return (
    <section aria-labelledby="attendance-chart-title" className="glass-strong flex min-w-0 flex-col gap-4.5 rounded-card px-5 py-5 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="attendance-chart-title" className="font-display text-h2 font-bold tracking-[-0.01em] text-text-primary">
            Rekap kehadiran
          </h2>
          <span className="text-small text-text-secondary">
            {formatDateRange(recap.from, recap.to)} · {recap.employeeCount} karyawan
          </span>
        </div>
        <Link href="/attendance" className={LINK}>
          Lihat rekap
        </Link>
      </div>

      {selected ? (
        <div aria-live="polite" className="flex flex-wrap items-center gap-x-4.5 gap-y-1 rounded-field bg-fill-subtle px-3.5 py-2.5 text-small text-text-secondary">
          <span className="min-w-36 text-sm font-bold text-text-primary">
            {formatIsoDate(selected.date)}
            {selected.date === recap.today ? " · hari ini" : ""}
          </span>
          {selected.expected === 0 ? (
            <span>Bukan hari kerja</span>
          ) : (
            <>
              <span>
                Hadir <b className="text-text-primary">{selected.onTime + selected.late}</b>
              </span>
              <span>
                Telat <b className="text-text-primary">{selected.late}</b>
              </span>
              <span>
                Izin <b className="text-text-primary">{selected.leave}</b>
              </span>
              <span>
                Alpa <b className="text-text-primary">{selected.absent}</b>
              </span>
              {selected.pending > 0 ? (
                <span>
                  Belum absen <b className="text-text-primary">{selected.pending}</b>
                </span>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex h-40.5 items-end gap-0.5 border-b border-border-control sm:gap-1.5">
          {days.map((day, index) => {
            const height = (value: number) => ({ height: `${(value / max) * 100}%` });
            return (
              <button
                key={day.date}
                type="button"
                aria-label={`${formatIsoDate(day.date)}: ${
                  day.expected === 0
                    ? "bukan hari kerja"
                    : `hadir ${day.onTime + day.late}, telat ${day.late}, izin ${day.leave}, alpa ${day.absent}${day.pending > 0 ? `, belum absen ${day.pending}` : ""}`
                }`}
                aria-pressed={index === active}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => setActive(index)}
                className={`flex h-full flex-1 cursor-pointer flex-col-reverse transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  index === active ? "opacity-100" : "opacity-55"
                }`}
              >
                <span className="block w-full bg-chart-present" style={height(day.onTime)} />
                <span className="block w-full bg-chart-late" style={height(day.late)} />
                <span className="block w-full bg-chart-leave" style={height(day.leave)} />
                <span className="block w-full bg-chart-absent" style={height(day.absent)} />
              </button>
            );
          })}
        </div>
        <div aria-hidden className="flex gap-0.5 sm:gap-1.5">
          {days.map((day, index) => (
            <span key={day.date} className="flex-1 text-center text-xs text-text-tertiary tabular-nums">
              {showsLabel(index, days.length) ? Number(day.date.slice(8, 10)) : ""}
            </span>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {legend.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-small text-text-secondary">
            <span aria-hidden className={`size-2.5 rounded-[3px] ${item.className}`} />
            <span>
              {item.label} · <b className="text-text-primary tabular-nums">{item.value}</b>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
