import type { MyTaskDay } from "@exapay/shared";
import type { ReactNode } from "react";

import { TaskIndicatorRow } from "@/components/tasks/TaskIndicatorRow";

type Props = {
  day: MyTaskDay;
  title: string;
  // Tombol/tautan di bawah daftar (mis. "Catat tugas" di /me)
  footer?: ReactNode;
};

// Ringkasan tugas satu tanggal per indikator template jabatan + pekerjaan lain (snapshot context/designs/me.html
// "Tugas hari ini"). Card solid — portal maks. 3 lapisan blur (header, kartu absen, bottom nav).
export function TaskSummaryCard({ day, title, footer }: Props) {
  return (
    <section aria-labelledby="task-summary-title" className="surface-solid flex flex-col rounded-[22px] px-4.5 pt-4.5 pb-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h2 id="task-summary-title" className="font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
          {title}
        </h2>
        {day.template ? <span className="truncate text-[13px] text-text-secondary">Template {day.template.name}</span> : null}
      </div>
      {day.template === null && day.otherCount === 0 ? (
        <p className="pt-1 pb-3 text-sm text-text-secondary">Jabatan Anda belum punya template KPI. Anda tetap bisa mencatat pekerjaan sebagai pekerjaan lain.</p>
      ) : (
        <ul>
          {day.indicators.map((indicator) => (
            <TaskIndicatorRow key={indicator.id} indicator={indicator} timeZone={day.timeZone} />
          ))}
          {day.otherCount > 0 || day.indicators.length === 0 ? (
            <li className="flex items-start justify-between gap-3 border-t border-border-subtle py-3.5 first:border-t-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-[14.5px] leading-[1.35] font-bold text-text-primary">Pekerjaan lain</span>
                <span className="text-[13px] text-text-secondary">Di luar indikator — tidak masuk skor KPI</span>
              </div>
              <span className="shrink-0 font-display text-[15px] font-extrabold text-text-primary tabular-nums">{day.otherCount} catatan</span>
            </li>
          ) : null}
        </ul>
      )}
      {footer ? <div className="mt-1.5 mb-2.5 flex flex-col gap-2">{footer}</div> : null}
    </section>
  );
}
