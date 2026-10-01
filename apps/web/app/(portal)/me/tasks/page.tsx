import { isoDateSchema } from "@exapay/shared";
import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { LogTaskButton } from "@/components/tasks/LogTaskButton";
import { TaskDayStrip } from "@/components/tasks/TaskDayStrip";
import { TaskLogList } from "@/components/tasks/TaskLogList";
import { TaskSummaryCard } from "@/components/tasks/TaskSummaryCard";
import { fetchMyTaskDay } from "@/lib/api/taskLogs";
import { requireActiveEmployee } from "@/lib/portalAccess";
import { longDate } from "@/lib/taskLogLabels";

export const metadata: Metadata = { title: "Tugas — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTION = "Catat pekerjaan harian Anda. Atasan memverifikasi setiap catatan.";

const ACCESS_MESSAGES = {
  not_linked: "Akun Anda belum tertaut ke data karyawan, jadi belum bisa mencatat tugas. Hubungi admin usaha.",
  inactive: "Data karyawan Anda sedang tidak aktif. Catatan lama tetap bisa dilihat di sini.",
} as const;

// Log tugas harian milik sendiri (feature 19): pilih tanggal di jendela catat (hari ini + 7 hari ke belakang),
// ringkasan per indikator, daftar catatan (ubah/hapus selama menunggu verifikasi).
// Tanpa snapshot halaman ini — diturunkan dari pola me.html (kartu "Tugas hari ini") & /me/attendance (izin user).
export default async function MyTasksPage({ searchParams }: Props) {
  await requireActiveEmployee();
  const raw = await searchParams;
  const requested = isoDateSchema.safeParse(typeof raw.date === "string" ? raw.date : undefined);
  const result = await fetchMyTaskDay(requested.success ? requested.data : null);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Tugas" description={DESCRIPTION} />
        <EmptyState icon={CloudOff} surface="solid" title="Catatan tugas tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const day = result.data;
  const isToday = day.date === day.today;
  const inWindow = day.date >= day.minDate && day.date <= day.today;
  return (
    <>
      <PageHeader
        title="Tugas"
        description={DESCRIPTION}
        actions={day.canLog ? <LogTaskButton workDate={day.date} indicators={day.indicators} placement="header" /> : null}
      />
      {day.access !== "ok" ? <FormAlert tone="info">{ACCESS_MESSAGES[day.access]}</FormAlert> : null}
      {raw.photo === "error" ? <FormAlert tone="danger">Foto tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}
      {day.access !== "not_linked" ? (
        <>
          <TaskDayStrip day={day} />
          {day.access === "ok" && inWindow && !day.checkedIn ? (
            <FormAlert tone="info">
              {isToday ? (
                <>
                  Absen masuk dulu untuk mencatat tugas hari ini.{" "}
                  <Link href="/me" className="font-bold text-accent-strong hover:text-accent-hover hover:underline">
                    Ke beranda
                  </Link>
                </>
              ) : (
                "Tidak ada absen masuk di tanggal ini, jadi tugas tidak bisa dicatat."
              )}
            </FormAlert>
          ) : null}
          {day.access === "ok" && !inWindow ? (
            <FormAlert tone="info">Tanggal ini di luar batas catat (hari ini sampai 7 hari ke belakang) — hanya bisa dilihat.</FormAlert>
          ) : null}
          <TaskSummaryCard day={day} title={isToday ? "Hari ini" : longDate(day.date)} />
          <TaskLogList logs={day.logs} indicators={day.indicators} timeZone={day.timeZone} />
        </>
      ) : null}
    </>
  );
}
