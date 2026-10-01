import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AttendanceCard } from "@/components/attendance/AttendanceCard";
import { AttendanceMonthTile } from "@/components/attendance/AttendanceMonthTile";
import { EmptyState } from "@/components/common/EmptyState";
import { KpiScoreTile } from "@/components/kpi/KpiScoreTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { LatestPayslipTile } from "@/components/payroll/LatestPayslipTile";
import { LogTaskButton } from "@/components/tasks/LogTaskButton";
import { TaskSummaryCard } from "@/components/tasks/TaskSummaryCard";
import { fetchAttendanceHistory, fetchAttendanceToday } from "@/lib/api/attendance";
import { fetchMyKpiScore } from "@/lib/api/kpiScores";
import { fetchMyPayslips } from "@/lib/api/payslips";
import { fetchMyTaskDay } from "@/lib/api/taskLogs";
import { getSession } from "@/lib/auth/getSession";
import { DEFAULT_TIME_ZONE, firstNameOf, formatLongDate, greetingFor } from "@/lib/datetime";
import { requireActiveEmployee } from "@/lib/portalAccess";

export const metadata: Metadata = { title: "Beranda — Exapay" };

// Beranda portal karyawan mengikuti snapshot context/designs/me.html. Kartu absen (feature 14) + tugas hari ini (feature 19)
// + grid tile (feature 37): "Skor bulan ini" (tampil jika jabatan punya template KPI), "Kehadiran bulan ini", "Slip gaji
// terakhir" (tampil jika ada slip terbit). Tile yang gagal dimuat dilewati — kartu utama tetap tampil.
export default async function PortalHomePage() {
  await requireActiveEmployee();
  const [session, today, tasks, score, history, payslips] = await Promise.all([
    getSession(),
    fetchAttendanceToday(),
    fetchMyTaskDay(null),
    fetchMyKpiScore(null),
    fetchAttendanceHistory(null),
    fetchMyPayslips(),
  ]);
  const timeZone = today.ok ? today.data.timeZone : DEFAULT_TIME_ZONE;
  const now = today.ok ? new Date(today.data.serverTime) : new Date();
  const scoreTile = score.ok && score.data.access !== "not_linked" && score.data.template ? score.data : null;
  const attendanceTile = history.ok && history.data.access !== "not_linked" ? history.data : null;
  const latestPayslip = payslips.ok && payslips.data.access === "ok" ? (payslips.data.payslips[0] ?? null) : null;

  return (
    <>
      <PageHeader title={`${greetingFor(now, timeZone)}, ${firstNameOf(session?.user.fullName ?? "")}`} description={formatLongDate(now, timeZone)} />
      {today.ok ? (
        <AttendanceCard today={today.data} />
      ) : (
        <EmptyState icon={CloudOff} title="Kartu absen belum bisa dimuat" description={today.error} />
      )}
      {tasks.ok ? (
        tasks.data.access === "ok" ? (
          <TaskSummaryCard
            day={tasks.data}
            title="Tugas hari ini"
            footer={
              <>
                <LogTaskButton workDate={tasks.data.date} indicators={tasks.data.indicators} placement="home" disabled={!tasks.data.canLog} />
                {!tasks.data.checkedIn ? <p className="text-center text-[13px] text-text-secondary">Absen masuk dulu untuk mencatat tugas.</p> : null}
                <Link href="/me/tasks" className="-mb-1 inline-flex min-h-11 items-center justify-center text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline">
                  Lihat semua catatan
                </Link>
              </>
            }
          />
        ) : null
      ) : (
        <EmptyState icon={CloudOff} surface="solid" title="Tugas hari ini belum bisa dimuat" description={tasks.error} />
      )}
      {scoreTile || attendanceTile || latestPayslip ? (
        <div className="grid grid-cols-2 gap-2.5">
          {scoreTile ? <KpiScoreTile score={scoreTile} /> : null}
          {attendanceTile ? <AttendanceMonthTile summary={attendanceTile.summary} wide={!scoreTile} /> : null}
          {latestPayslip ? <LatestPayslipTile payslip={latestPayslip} /> : null}
        </div>
      ) : null}
    </>
  );
}
