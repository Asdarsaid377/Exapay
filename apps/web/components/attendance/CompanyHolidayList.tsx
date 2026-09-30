import type { CompanyHoliday, Weekday } from "@exapay/shared";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { CompanyHolidayActions } from "@/components/attendance/CompanyHolidayActions";
import { weekdayLabelOf, weekdayOf } from "@/lib/workCalendarLabels";

type Props = {
  holidays: CompanyHoliday[];
  workdays: Weekday[];
  year: number;
  currentYear: number;
};

// Daftar libur khusus usaha satu tahun
export function CompanyHolidayList({ holidays, workdays, year, currentYear }: Props) {
  if (holidays.length === 0) {
    return <p className="py-3 text-sm text-text-secondary">Belum ada libur usaha di {year}.</p>;
  }
  return (
    <ul>
      {holidays.map((holiday) => (
        <li key={holiday.id} className="flex min-h-15 items-center gap-3 border-t border-border-subtle py-2.5 first:border-t-0">
          <CalendarDate date={holiday.date} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="truncate text-[14.5px] font-bold text-text-primary">{holiday.name}</p>
            <p className="text-small text-text-secondary">
              {weekdayLabelOf(holiday.date)} · Libur usaha
              {!workdays.includes(weekdayOf(holiday.date)) ? <span className="text-text-tertiary"> · di luar hari kerja</span> : null}
            </p>
          </div>
          <CompanyHolidayActions holiday={holiday} year={year} currentYear={currentYear} />
        </li>
      ))}
    </ul>
  );
}
