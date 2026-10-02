import type { MySchedule } from "@exapay/shared";

import { rosterEntryLabel, scheduleDayLabel } from "@/lib/shiftLabels";

type Props = {
  schedule: MySchedule;
};

// Kartu "Jadwal saya" di beranda portal (design me-schedule "MyScheduleCard"), hanya karyawan mode shift: 7 baris hari +
// shift, hari ini ditandai. Belum ada roster sama sekali → "Jadwal belum diatur". Card solid (portal maks 3 lapisan blur).
export function MyScheduleCard({ schedule }: Props) {
  const empty = schedule.days.every((day) => day.entry === null);
  return (
    <section aria-labelledby="my-schedule-title" className="surface-solid flex flex-col rounded-card px-4.5 pt-4.5 pb-3.5">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 id="my-schedule-title" className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
          Jadwal saya
        </h2>
        <span className="text-[13px] text-text-secondary">7 hari ke depan</span>
      </div>
      {empty ? (
        <p className="border-t border-border-subtle pt-3.5 pb-1.5 text-[14.5px] text-pretty text-neutral-text">Jadwal belum diatur — tanyakan atasan Anda.</p>
      ) : (
        <>
          <ul>
            {schedule.days.map((day) => {
              const today = day.date === schedule.today;
              const off = day.entry?.kind !== "shift";
              return (
                <li key={day.date} className="flex min-h-11.5 items-center gap-3 border-t border-border-subtle">
                  <div className="flex w-23 shrink-0 flex-col">
                    <span className={`text-[14.5px] tabular-nums ${today ? "font-bold text-text-primary" : "font-medium text-text-primary"}`}>{scheduleDayLabel(day.date)}</span>
                    {today ? <span className="text-xs text-accent-strong">Hari ini</span> : null}
                  </div>
                  <span className={`flex-1 text-[14.5px] tabular-nums ${off ? "text-text-tertiary" : "font-medium text-text-primary"}`}>
                    {day.entry ? rosterEntryLabel(day.entry) : "Belum diatur"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border-subtle pt-2.5 text-caption text-pretty text-text-tertiary">Jadwal bisa berubah — Anda diberi tahu lewat email.</p>
        </>
      )}
    </section>
  );
}
