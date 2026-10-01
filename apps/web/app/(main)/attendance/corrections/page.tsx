import { attendanceCorrectionListQuerySchema } from "@exapay/shared";
import { CloudOff, History, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AttendanceCorrectionList } from "@/components/attendance/AttendanceCorrectionList";
import { AttendanceDayList } from "@/components/attendance/AttendanceDayList";
import { AttendancePeriodNav } from "@/components/attendance/AttendancePeriodNav";
import { CorrectionEmployeeSelect } from "@/components/attendance/CorrectionEmployeeSelect";
import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAttendanceCorrections, fetchAttendanceRecap, fetchEmployeeAttendanceDays } from "@/lib/api/attendanceRecap";
import { correctionsHref, periodQueryFrom, periodRangeCaption, periodViewOf, recapHref } from "@/lib/attendanceRecapLabels";

export const metadata: Metadata = { title: "Koreksi absensi — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

// Koreksi absensi (feature 16, owner/admin): pilih karyawan & periode → rincian harian → koreksi jam masuk/pulang
// (alasan wajib, tercatat di riwayat + audit log). Tanpa karyawan terpilih: riwayat koreksi semua karyawan.
// Tanpa referensi desain — pola halaman Karyawan + daftar CalendarDate (izin user).
export default async function AttendanceCorrectionsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const period = periodQueryFrom(raw);
  const listQuery = attendanceCorrectionListQuerySchema.parse({ employeeId: first(raw.employee) ?? null, page: first(raw.page) });
  const employeeId = listQuery.employeeId;

  const [recap, corrections, days] = await Promise.all([
    fetchAttendanceRecap(period),
    fetchAttendanceCorrections(listQuery),
    employeeId ? fetchEmployeeAttendanceDays(employeeId, period) : Promise.resolve(null),
  ]);

  const header = (
    <PageHeader title="Koreksi absensi" description="Isi jam masuk/pulang yang terlewat atau keliru. Setiap koreksi wajib beralasan dan tercatat di audit log." />
  );
  if (!recap.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Data absensi tidak dapat dimuat" description={recap.error} />
      </>
    );
  }

  // Bulan = periode tutup buku payroll (feature 30b)
  const currentMonth = recap.data.currentMonth;
  const view = periodViewOf(period, currentMonth);
  const employees = recap.data.rows.map((row) => row.employee);
  // Karyawan terpilih di luar periode tetap bisa dipilih ulang
  if (days?.ok && !employees.some((employee) => employee.id === days.data.employee.id)) employees.push(days.data.employee);

  let history = null;
  if (!corrections.ok) {
    history = <EmptyState icon={CloudOff} title="Riwayat koreksi tidak dapat dimuat" description={corrections.error} />;
  } else if (corrections.data.items.length === 0) {
    history = (
      <EmptyState
        icon={History}
        title="Belum ada koreksi"
        description={employeeId ? "Koreksi untuk karyawan ini akan tercatat di sini." : "Setiap koreksi absensi akan tercatat di sini beserta alasannya."}
      />
    );
  } else {
    const list = corrections.data;
    history = (
      <AttendanceCorrectionList
        items={list.items}
        timeZone={list.timeZone}
        showEmployee={!employeeId}
        footer={
          list.total > list.pageSize ? (
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(page) => correctionsHref({ employeeId, view, currentMonth, page })} />
          ) : (
            <p className="text-small text-text-secondary tabular-nums">{list.total} koreksi</p>
          )
        }
      />
    );
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-3 lg:flex-row lg:gap-4">
        <CorrectionEmployeeSelect employees={employees} value={employeeId} view={view} currentMonth={currentMonth} />
        <div className="min-w-0 flex-1">
          <AttendancePeriodNav
            view={view}
            currentMonth={currentMonth}
            from={recap.data.from}
            to={recap.data.to}
            caption={periodRangeCaption(view, recap.data.from, recap.data.to)}
            basePath="/attendance/corrections"
            keep={employeeId ? { employee: employeeId } : {}}
          />
        </div>
      </div>
      {!days ? (
        <EmptyState
          icon={UserSearch}
          title="Pilih karyawan"
          description="Pilih karyawan untuk melihat absensi hariannya, lalu koreksi tanggal yang terlewat atau keliru. Karyawan dengan alpa atau tanpa absen pulang terlihat di rekap."
          action={
            <Link href={recapHref(view, currentMonth)} className={buttonClassName({ variant: "secondary" })}>
              Lihat rekap
            </Link>
          }
        />
      ) : days.ok ? (
        <AttendanceDayList data={days.data} />
      ) : (
        <EmptyState icon={CloudOff} title="Absensi karyawan tidak dapat dimuat" description={days.error} />
      )}
      {history}
    </>
  );
}
