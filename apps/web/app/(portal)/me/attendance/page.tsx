import { attendanceMonthSchema } from "@exapay/shared";
import { CalendarDays, CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { AttendanceHistoryList } from "@/components/attendance/AttendanceHistoryList";
import { AttendanceMonthNav } from "@/components/attendance/AttendanceMonthNav";
import { AttendanceSummary } from "@/components/attendance/AttendanceSummary";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAttendanceHistory } from "@/lib/api/attendance";
import { monthLabel } from "@/lib/attendanceLabels";
import { todayIso } from "@/lib/datetime";

export const metadata: Metadata = { title: "Absensi — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const ACCESS_MESSAGES = {
  not_linked: "Akun Anda belum tertaut ke data karyawan, jadi belum ada riwayat absensi. Hubungi admin usaha.",
  inactive: "Data karyawan Anda sedang tidak aktif. Riwayat lama tetap bisa dilihat di sini.",
} as const;

// Riwayat absen masuk/pulang milik sendiri per bulan (feature 14). Tanpa snapshot — diturunkan dari pola me.html (izin user).
// Pengajuan izin/sakit/cuti menyusul di halaman ini (feature 15).
export default async function MyAttendancePage({ searchParams }: Props) {
  const raw = await searchParams;
  const requested = attendanceMonthSchema.safeParse(typeof raw.month === "string" ? raw.month : undefined);
  const history = await fetchAttendanceHistory(requested.success ? requested.data : null);
  const header = <PageHeader title="Absensi" description="Riwayat absen masuk dan pulang Anda." />;

  if (!history.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} surface="solid" title="Riwayat absensi tidak dapat dimuat" description={history.error} />
      </>
    );
  }

  const { access, month, currentMonth, timeZone, records, summary } = history.data;
  return (
    <>
      {header}
      {access !== "ok" ? <FormAlert tone="info">{ACCESS_MESSAGES[access]}</FormAlert> : null}
      <AttendanceMonthNav month={month} currentMonth={currentMonth} />
      <AttendanceSummary summary={summary} />
      {records.length > 0 ? (
        <AttendanceHistoryList records={records} timeZone={timeZone} today={todayIso(timeZone)} />
      ) : (
        <EmptyState icon={CalendarDays} surface="solid" title="Belum ada absensi" description={`Tidak ada absen masuk di ${monthLabel(month)}.`} />
      )}
    </>
  );
}
