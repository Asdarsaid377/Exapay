import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { AttendanceCard } from "@/components/attendance/AttendanceCard";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAttendanceToday } from "@/lib/api/attendance";
import { getSession } from "@/lib/auth/getSession";
import { DEFAULT_TIME_ZONE, firstNameOf, formatLongDate, greetingFor } from "@/lib/datetime";

export const metadata: Metadata = { title: "Beranda — Exapay" };

// Beranda portal karyawan mengikuti snapshot context/designs/me.html. Kartu absen (feature 14); tugas hari ini menyusul (feature 19).
export default async function PortalHomePage() {
  const [session, today] = await Promise.all([getSession(), fetchAttendanceToday()]);
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
    </>
  );
}
