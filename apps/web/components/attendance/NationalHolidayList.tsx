import type { NationalHoliday, Weekday } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { CalendarDate } from "@/components/attendance/CalendarDate";
import { NationalHolidayActions } from "@/components/attendance/NationalHolidayActions";
import { HOLIDAY_KIND_LABELS, weekdayLabelOf, weekdayOf } from "@/lib/workCalendarLabels";

type Props = {
  holidays: NationalHoliday[];
  // Hari kerja jadwal — libur di luar hari kerja tidak mengurangi hari kerja
  workdays: Weekday[];
};

// Daftar libur nasional & cuti bersama satu tahun (data SKB 3 Menteri). Baris "tetap masuk" diredupkan + badge outline.
export function NationalHolidayList({ holidays, workdays }: Props) {
  return (
    <ul>
      {holidays.map((holiday) => {
        const onWeekend = !workdays.includes(weekdayOf(holiday.date));
        const muted = !holiday.observed;
        return (
          <li key={holiday.date} className="flex min-h-15 items-center gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
            <CalendarDate date={holiday.date} muted={muted} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className={`text-[14.5px] font-bold ${muted ? "text-text-tertiary" : "text-text-primary"}`}>{holiday.name}</p>
              <p className="text-small text-text-secondary">
                {weekdayLabelOf(holiday.date)} · {HOLIDAY_KIND_LABELS[holiday.kind]}
                {onWeekend ? <span className="text-text-tertiary"> · di luar hari kerja</span> : null}
              </p>
            </div>
            {muted ? <Badge tone="outline">Tetap masuk</Badge> : null}
            <NationalHolidayActions date={holiday.date} name={holiday.name} observed={holiday.observed} />
          </li>
        );
      })}
    </ul>
  );
}
