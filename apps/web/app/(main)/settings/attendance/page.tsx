import { calendarYearSchema } from "@exapay/shared";
import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { AddCompanyHolidayButton } from "@/components/attendance/AddCompanyHolidayButton";
import { CompanyHolidayList } from "@/components/attendance/CompanyHolidayList";
import { HolidayYearSwitch } from "@/components/attendance/HolidayYearSwitch";
import { NationalHolidayList } from "@/components/attendance/NationalHolidayList";
import { WorkingDaysSummary } from "@/components/attendance/WorkingDaysSummary";
import { WorkScheduleForm } from "@/components/attendance/WorkScheduleForm";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { FormSection } from "@/components/common/FormSection";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchHolidayOverview, fetchWorkSchedule } from "@/lib/api/workCalendar";
import { todayIso } from "@/lib/datetime";

export const metadata: Metadata = { title: "Pengaturan absensi — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Jadwal kerja & hari libur (feature 13). Aturan potongan absensi (feature 17) menyusul di halaman ini.
// Proxy sudah membatasi ke owner/admin; API memeriksa ulang.
export default async function SettingsAttendancePage({ searchParams }: Props) {
  const raw = await searchParams;
  const today = todayIso();
  const currentYear = Number(today.slice(0, 4));
  const requested = calendarYearSchema.safeParse(typeof raw.year === "string" ? raw.year : undefined);
  const year = requested.success ? requested.data : currentYear;

  const [schedule, holidays] = await Promise.all([fetchWorkSchedule(), fetchHolidayOverview(year)]);
  const header = (
    <PageHeader
      title="Pengaturan absensi"
      description="Jadwal kerja dan hari libur usaha. Dipakai untuk menandai keterlambatan, menghitung hari kerja di KPI, dan potongan absensi di payroll."
    />
  );

  if (!schedule.ok || !holidays.ok) {
    const error = !schedule.ok ? schedule.error : !holidays.ok ? holidays.error : "";
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Pengaturan absensi tidak dapat dimuat" description={error} />
      </>
    );
  }

  const overview = holidays.data;
  const workdays = schedule.data.days.filter((day) => day.isWorkday).map((day) => day.weekday);
  const years = [...new Set([...overview.nationalYears, currentYear, year])].sort((a, b) => a - b);
  const yearSwitch = <HolidayYearSwitch year={year} years={years} currentYear={currentYear} />;

  return (
    <>
      {header}
      <div className="flex flex-col gap-4 lg:gap-5">
        <FormSection
          title="Jadwal kerja"
          description="Berlaku untuk semua karyawan. Jam masuk dipakai untuk menandai keterlambatan saat absen."
        >
          <WorkScheduleForm schedule={schedule.data} />
        </FormSection>

        <FormSection
          title={`Hari libur ${year}`}
          description="Libur nasional dan cuti bersama mengikuti SKB 3 Menteri dan otomatis diliburkan. Cuti bersama bagi usaha swasta mengikuti kesepakatan — pilih “Tetap masuk kerja” untuk tanggal yang tidak diliburkan."
          aside={yearSwitch}
        >
          <div className="flex flex-col gap-6">
            <section aria-labelledby="national-holidays-title" className="flex flex-col gap-2">
              <h3 id="national-holidays-title" className="text-[15px] font-bold text-text-primary">
                Libur nasional & cuti bersama{" "}
                <span className="font-medium text-text-tertiary tabular-nums">{overview.national.length}</span>
              </h3>
              {overview.national.length === 0 ? (
                <FormAlert tone="warning">
                  Data libur nasional {year} belum tersedia. Akan ditambahkan setelah SKB 3 Menteri untuk tahun tersebut terbit. Sementara itu, tambahkan
                  sebagai libur usaha jika perlu.
                </FormAlert>
              ) : (
                <NationalHolidayList holidays={overview.national} workdays={workdays} />
              )}
            </section>

            <section aria-labelledby="company-holidays-title" className="flex flex-col gap-2 border-t border-border-subtle pt-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <h3 id="company-holidays-title" className="text-[15px] font-bold text-text-primary">
                    Libur usaha <span className="font-medium text-text-tertiary tabular-nums">{overview.company.length}</span>
                  </h3>
                  <p className="text-small text-text-secondary">Libur khusus usaha Anda, mis. ulang tahun usaha atau libur daerah.</p>
                </div>
                <AddCompanyHolidayButton year={year} currentYear={currentYear} />
              </div>
              <CompanyHolidayList holidays={overview.company} workdays={workdays} year={year} currentYear={currentYear} />
            </section>
          </div>
        </FormSection>

        <FormSection
          title={`Hari kerja ${year}`}
          description="Dihitung dari jadwal kerja dan hari libur di atas. Dipakai untuk prorata target KPI dan pembagi potongan absensi."
        >
          <WorkingDaysSummary months={overview.workingDaysByMonth} currentMonth={year === currentYear ? Number(today.slice(5, 7)) - 1 : null} />
        </FormSection>
      </div>
    </>
  );
}
