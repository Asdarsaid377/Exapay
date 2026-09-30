import { attendanceMonthSchema } from "@exapay/shared";
import { CloudOff, Target } from "lucide-react";
import type { Metadata } from "next";

import { AttendanceMonthNav } from "@/components/attendance/AttendanceMonthNav";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { KpiIndicatorBreakdown } from "@/components/kpi/KpiIndicatorBreakdown";
import { KpiMyScoreCard } from "@/components/kpi/KpiMyScoreCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchMyKpiScore } from "@/lib/api/kpiScores";
import { formatDateRange } from "@/lib/leaveLabels";

export const metadata: Metadata = { title: "Kinerja saya — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTION = "Skor KPI Anda per bulan, dari catatan tugas yang disetujui atasan dan kehadiran.";

// Skor KPI milik sendiri per bulan (feature 21). Tanpa referensi desain halaman ini — pola /me/attendance (navigasi bulan)
// + tile "Skor bulan ini" & kartu "Tugas hari ini" snapshot me.html (izin user).
export default async function MyPerformancePage({ searchParams }: Props) {
  const raw = await searchParams;
  const month = attendanceMonthSchema.safeParse(typeof raw.month === "string" ? raw.month : undefined);
  const result = await fetchMyKpiScore(month.success ? month.data : null);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Kinerja saya" description={DESCRIPTION} />
        <EmptyState icon={CloudOff} surface="solid" title="Skor KPI tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const score = result.data;
  if (score.access === "not_linked") {
    return (
      <>
        <PageHeader title="Kinerja saya" description={DESCRIPTION} />
        <FormAlert tone="info">Akun Anda belum tertaut ke data karyawan, jadi belum ada skor KPI. Hubungi admin usaha.</FormAlert>
      </>
    );
  }

  const period = formatDateRange(score.from, score.to);
  return (
    <>
      <PageHeader title="Kinerja saya" description={DESCRIPTION} />
      <AttendanceMonthNav month={score.month} currentMonth={score.currentMonth} basePath="/me/performance" />
      {score.template === null || score.result === null ? (
        <EmptyState
          icon={Target}
          surface="solid"
          title="Jabatan Anda belum punya template KPI"
          description="Skor dihitung dari indikator template KPI jabatan Anda. Minta pemilik atau admin memasang template untuk jabatan Anda."
        />
      ) : (
        <>
          <KpiMyScoreCard result={score.result} templateName={score.template.name} period={period} />
          <section aria-labelledby="kpi-breakdown-title" className="surface-solid flex flex-col rounded-[22px] px-4.5 pt-4.5 pb-2.5">
            <h2 id="kpi-breakdown-title" className="mb-1.5 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
              Rincian indikator
            </h2>
            <KpiIndicatorBreakdown result={score.result} />
          </section>
        </>
      )}
    </>
  );
}
