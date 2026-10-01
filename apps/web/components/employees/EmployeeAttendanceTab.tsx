import type { AttendancePeriodQuery, EmployeeAttendanceDays } from "@exapay/shared";
import { CloudOff } from "lucide-react";

import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import { AttendancePeriodNav } from "@/components/attendance/AttendancePeriodNav";
import { EmptyState } from "@/components/common/EmptyState";
import type { ApiResult } from "@/lib/api/server";
import { periodRangeCaption, periodViewOf } from "@/lib/attendanceRecapLabels";

type Props = {
  employeeId: string;
  period: AttendancePeriodQuery;
  days: ApiResult<EmployeeAttendanceDays>;
};

// Tab Absensi detail karyawan (feature 37b): periode tutup buku payroll / rentang bebas + rincian harian & ringkasan.
// Tanpa referensi desain tab ini — pola halaman Koreksi absensi (AttendancePeriodNav + AttendanceDayList), izin user.
// Owner/admin tetap bisa mengoreksi per tanggal dari sini (tombol sama dengan halaman Koreksi).
export function EmployeeAttendanceTab({ employeeId, period, days }: Props) {
  if (!days.ok) return <EmptyState icon={CloudOff} title="Absensi karyawan tidak dapat dimuat" description={days.error} />;
  const data = days.data;
  const view = periodViewOf(period, data.currentMonth);
  return (
    <div className="flex flex-col gap-4">
      <AttendancePeriodNav
        view={view}
        currentMonth={data.currentMonth}
        from={data.from}
        to={data.to}
        caption={periodRangeCaption(view, data.from, data.to)}
        basePath={`/employees/${employeeId}`}
        keep={{ tab: "attendance" }}
      />
      <AttendanceDayList data={data} showEmployee={false} />
    </div>
  );
}
