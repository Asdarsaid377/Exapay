import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AttendanceCard } from "@/components/attendance/AttendanceCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { LogTaskButton } from "@/components/tasks/LogTaskButton";
import { TaskSummaryCard } from "@/components/tasks/TaskSummaryCard";
import { fetchAttendanceToday } from "@/lib/api/attendance";
import { fetchMyTaskDay } from "@/lib/api/taskLogs";
import { getSession } from "@/lib/auth/getSession";
import { DEFAULT_TIME_ZONE, firstNameOf, formatLongDate, greetingFor } from "@/lib/datetime";

export const metadata: Metadata = { title: "Beranda — Exapay" };

// Beranda portal karyawan mengikuti snapshot context/designs/me.html. Kartu absen (feature 14) + tugas hari ini (feature 19).
export default async function PortalHomePage() {
  const [session, today, tasks] = await Promise.all([getSession(), fetchAttendanceToday(), fetchMyTaskDay(null)]);
  const timeZone = today.ok ? today.data.timeZone : DEFAULT_TIME_ZONE;
  const now = today.ok ? new Date(today.data.serverTime) : new Date();

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
    </>
  );
}
