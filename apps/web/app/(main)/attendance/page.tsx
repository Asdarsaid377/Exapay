import { CloudOff, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AttendancePeriodNav } from "@/components/attendance/AttendancePeriodNav";
import { AttendanceRecapTable } from "@/components/attendance/AttendanceRecapTable";
import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAttendanceRecap } from "@/lib/api/attendanceRecap";
import { formatDuration } from "@/lib/attendanceLabels";
import { correctionsHref, periodQueryFrom, periodViewOf } from "@/lib/attendanceRecapLabels";

export const metadata: Metadata = { title: "Rekap absensi — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Rekap absensi per periode (feature 16). Owner/admin: semua karyawan + tautan rincian/koreksi; atasan: bawahan langsung.
// Tanpa referensi desain — pola halaman Karyawan + StatTile dashboard (izin user).
export default async function AttendanceRecapPage({ searchParams }: Props) {
  const query = periodQueryFrom(await searchParams);
  const result = await fetchAttendanceRecap(query);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Rekap absensi" />
        <EmptyState icon={CloudOff} title="Rekap absensi tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const recap = result.data;
  const manage = recap.scope === "all";
  const view = periodViewOf(query, recap.today);
  const currentMonth = recap.today.slice(0, 7);

  const totals = recap.rows.reduce(
    (sum, { summary }) => ({
      absent: sum.absent + summary.absent,
      late: sum.late + summary.late,
      lateMinutes: sum.lateMinutes + summary.lateMinutes,
      leaveDays: sum.leaveDays + summary.permit + summary.sick + summary.leave,
      missingCheckOut: sum.missingCheckOut + summary.missingCheckOut,
    }),
    { absent: 0, late: 0, lateMinutes: 0, leaveDays: 0, missingCheckOut: 0 },
  );

  return (
    <>
      <PageHeader
        title="Rekap absensi"
        description={manage ? "Kehadiran seluruh karyawan per periode." : "Kehadiran bawahan langsung Anda · hanya baca."}
        actions={
          manage ? (
            <Link href={correctionsHref({ employeeId: null, view, currentMonth })} className={buttonClassName({ variant: "secondary", className: "max-sm:h-11" })}>
              Koreksi absensi
            </Link>
          ) : null
        }
      />
      <AttendancePeriodNav view={view} currentMonth={currentMonth} from={recap.from} to={recap.to} basePath="/attendance" />
      {recap.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={manage ? "Belum ada karyawan di periode ini" : "Belum ada bawahan"}
          description={
            manage
              ? "Rekap tampil untuk karyawan yang sudah bekerja pada periode terpilih."
              : "Karyawan yang atasan langsungnya Anda akan muncul di sini. Minta pemilik atau admin mengatur atasan langsung di data karyawan."
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatTile label="Alpa" value={String(totals.absent)} note="hari kerja tanpa absen & tanpa izin" />
            <StatTile label="Telat" value={String(totals.late)} note={totals.late > 0 ? `kali · total ${formatDuration(totals.lateMinutes)}` : "kali"} />
            <StatTile label="Izin, sakit, cuti" value={String(totals.leaveDays)} note="hari kerja, pengajuan disetujui" />
            <StatTile label="Tanpa absen pulang" value={String(totals.missingCheckOut)} note={manage && totals.missingCheckOut > 0 ? "perlu dikoreksi" : "hari"} />
          </div>
          <AttendanceRecapTable
            rows={recap.rows}
            detailHref={manage ? (employeeId) => correctionsHref({ employeeId, view, currentMonth }) : null}
            footer={
              <p className="text-small text-pretty text-text-secondary tabular-nums">
                {recap.rows.length} karyawan · {recap.workingDays} hari kerja dalam periode · alpa dihitung sampai kemarin
              </p>
            }
          />
        </>
      )}
    </>
  );
}
