import { attendanceMonthSchema } from "@exapay/shared";
import { CalendarDays, CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { AttendanceHistoryList } from "@/components/attendance/AttendanceHistoryList";
import { AttendanceMonthNav } from "@/components/attendance/AttendanceMonthNav";
import { AttendanceSummary } from "@/components/attendance/AttendanceSummary";
import { MyLeaveRequestList } from "@/components/attendance/MyLeaveRequestList";
import { NewLeaveRequestButton } from "@/components/attendance/NewLeaveRequestButton";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAttendanceHistory } from "@/lib/api/attendance";
import { fetchMyLeaveRequests } from "@/lib/api/leaveRequests";
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

// Riwayat absen masuk/pulang milik sendiri per bulan (feature 14) + pengajuan izin/sakit/cuti (feature 15).
// Tanpa snapshot — diturunkan dari pola me.html (izin user).
export default async function MyAttendancePage({ searchParams }: Props) {
  const raw = await searchParams;
  const requested = attendanceMonthSchema.safeParse(typeof raw.month === "string" ? raw.month : undefined);
  const month = requested.success ? requested.data : null;
  const [history, leave] = await Promise.all([fetchAttendanceHistory(month), fetchMyLeaveRequests(month)]);

  if (!history.ok) {
    return (
      <>
        <PageHeader title="Absensi" description="Riwayat absensi dan pengajuan izin Anda." />
        <EmptyState icon={CloudOff} surface="solid" title="Riwayat absensi tidak dapat dimuat" description={history.error} />
      </>
    );
  }

  const { access, currentMonth, timeZone, records, summary } = history.data;
  const leaveData = leave.ok ? leave.data : null;
  const leaveDays = leaveData?.leaveDays ?? [];
  return (
    <>
      <PageHeader
        title="Absensi"
        description="Riwayat absensi dan pengajuan izin Anda."
        actions={access === "ok" && leaveData ? <NewLeaveRequestButton today={leaveData.today} /> : null}
      />
      {access !== "ok" ? <FormAlert tone="info">{ACCESS_MESSAGES[access]}</FormAlert> : null}
      {raw.attachment === "error" ? <FormAlert tone="danger">Lampiran tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}
      <AttendanceMonthNav month={history.data.month} currentMonth={currentMonth} />
      <AttendanceSummary summary={summary} leave={leaveData?.summary ?? null} />
      {leaveData ? (
        access !== "not_linked" ? <MyLeaveRequestList requests={leaveData.requests} /> : null
      ) : (
        <FormAlert tone="danger">Pengajuan izin tidak dapat dimuat: {leave.ok ? "" : leave.error}</FormAlert>
      )}
      {records.length > 0 || leaveDays.length > 0 ? (
        <AttendanceHistoryList records={records} leaveDays={leaveDays} timeZone={timeZone} today={todayIso(timeZone)} />
      ) : (
        <EmptyState icon={CalendarDays} surface="solid" title="Belum ada absensi" description={`Tidak ada absen masuk di ${monthLabel(history.data.month)}.`} />
      )}
    </>
  );
}
