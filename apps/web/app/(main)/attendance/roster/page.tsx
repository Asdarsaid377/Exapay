import { isoDateSchema } from "@exapay/shared";
import { CalendarClock, CloudOff, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { RosterBoard } from "@/components/attendance/RosterBoard";
import { RosterToolbar } from "@/components/attendance/RosterToolbar";
import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchOrganization } from "@/lib/api/organization";
import { fetchRosterWeek } from "@/lib/api/shiftRoster";
import { addIsoDays } from "@/lib/shiftLabels";

export const metadata: Metadata = { title: "Roster — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

// Roster shift (feature 46, design context/designs/attendance-roster.html): karyawan mode shift × 7 hari. Owner/admin semua
// karyawan, atasan bawahan langsung (cakupan dari API). Menu hanya tampil bila usaha punya master shift.
export default async function AttendanceRosterPage({ searchParams }: Props) {
  const raw = await searchParams;
  const week = isoDateSchema.safeParse(first(raw.week));
  const department = z.uuid().safeParse(first(raw.departmentId));
  const departmentId = department.success ? department.data : null;
  const [result, organization] = await Promise.all([
    fetchRosterWeek({ week: week.success ? week.data : undefined, departmentId: departmentId ?? undefined }),
    fetchOrganization(),
  ]);

  const header = (
    <PageHeader
      title="Roster"
      description="Atur shift karyawan per tanggal. Hari tanpa shift dihitung libur."
      actions={
        result.ok && result.data.canManageShifts && result.data.hasShifts ? (
          <Link href="/settings/attendance" className="text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline">
            Kelola shift
          </Link>
        ) : undefined
      }
    />
  );

  if (!result.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Roster tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const data = result.data;
  if (!data.hasShifts) {
    return (
      <>
        {header}
        <EmptyState
          icon={CalendarClock}
          title="Shift belum diaktifkan"
          description={
            data.canManageShifts
              ? "Usaha Anda memakai jadwal kerja yang sama untuk semua karyawan. Buat shift di Pengaturan › Absensi jika karyawan bekerja bergiliran."
              : "Pemilik atau admin belum membuat shift kerja."
          }
          action={
            data.canManageShifts ? (
              <Link href="/settings/attendance" className={buttonClassName({ variant: "secondary" })}>
                Aktifkan shift
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  const currentWeekStart = weekStartOf(data.today);
  const departments = organization.ok ? organization.data.departments : [];

  return (
    <>
      {header}
      <div className="flex flex-col gap-4 lg:gap-5">
        <RosterToolbar
          weekStart={data.weekStart}
          currentWeekStart={currentWeekStart}
          departmentId={departmentId}
          departments={departments}
          canCopy={data.employees.length > 0}
        />
        {data.employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Belum ada karyawan bermode shift"
            description="Ubah mode jadwal di detail karyawan (Pengaturan absen)."
            action={
              <Link href="/employees" className="text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline">
                Buka daftar karyawan
              </Link>
            }
          />
        ) : (
          <RosterBoard data={data} />
        )}
        {data.businessModeCount > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 text-sm text-text-secondary">
            <span>{data.businessModeCount} karyawan ikut jadwal usaha tidak tampil di roster.</span>
            <Link href="/employees" className="font-bold text-accent-strong hover:text-accent-hover hover:underline">
              Lihat karyawan
            </Link>
          </div>
        ) : null}
      </div>
    </>
  );
}

// Senin minggu yang memuat tanggal ini (sama dengan API)
function weekStartOf(isoDate: string): string {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return addIsoDays(isoDate, -((weekday + 6) % 7));
}
