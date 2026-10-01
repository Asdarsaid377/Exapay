import { attendanceMonthSchema, type MyKpiReviewList as MyKpiReviewListData, type MyKpiScore } from "@exapay/shared";
import { ClipboardCheck, CloudOff, Target } from "lucide-react";
import type { Metadata } from "next";

import { AttendanceMonthNav } from "@/components/attendance/AttendanceMonthNav";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { KpiIndicatorBreakdown } from "@/components/kpi/KpiIndicatorBreakdown";
import { KpiMyScoreCard } from "@/components/kpi/KpiMyScoreCard";
import { MyKpiReviewList } from "@/components/kpi/MyKpiReviewList";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ApiResult } from "@/lib/api/server";
import { fetchMyKpiReviews } from "@/lib/api/kpiReviews";
import { fetchMyKpiScore } from "@/lib/api/kpiScores";
import { formatDateRange } from "@/lib/leaveLabels";
import { requireActiveEmployee } from "@/lib/portalAccess";

export const metadata: Metadata = { title: "Kinerja saya — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTION = "Skor KPI Anda per bulan, dari catatan tugas yang disetujui atasan dan kehadiran.";

// Skor bulan terpilih (feature 21): navigasi bulan + skor + rincian indikator
function MonthlyScore({ score }: { score: MyKpiScore }) {
  if (score.template === null || score.result === null) {
    return (
      <>
        <AttendanceMonthNav month={score.month} currentMonth={score.currentMonth} basePath="/me/performance" />
        <EmptyState
          icon={Target}
          surface="solid"
          title="Jabatan Anda belum punya template KPI"
          description="Skor dihitung dari indikator template KPI jabatan Anda. Minta pemilik atau admin memasang template untuk jabatan Anda."
        />
      </>
    );
  }
  return (
    <>
      <AttendanceMonthNav month={score.month} currentMonth={score.currentMonth} basePath="/me/performance" />
      <KpiMyScoreCard result={score.result} templateName={score.template.name} period={formatDateRange(score.from, score.to)} />
      <section aria-labelledby="kpi-breakdown-title" className="surface-solid flex flex-col rounded-card px-4.5 pt-4.5 pb-2.5">
        <h2 id="kpi-breakdown-title" className="mb-1.5 font-display text-[17px] font-bold tracking-[-0.01em] text-text-primary">
          Rincian indikator
        </h2>
        <KpiIndicatorBreakdown result={score.result} />
      </section>
    </>
  );
}

// Penilaian periodik final (feature 37): hanya yang sudah difinalkan owner/admin, terbaru dulu
function FinalReviews({ reviews }: { reviews: ApiResult<MyKpiReviewListData> }) {
  return (
    <section aria-labelledby="kpi-reviews-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5 px-1 pt-2">
        <h2 id="kpi-reviews-title" className="font-display text-[19px] font-extrabold tracking-[-0.01em] text-text-primary">
          Penilaian periodik
        </h2>
        <p className="text-small text-text-secondary text-pretty">Hasil penilaian yang sudah difinalkan, termasuk catatan dari atasan.</p>
      </div>
      {!reviews.ok ? (
        <EmptyState icon={CloudOff} surface="solid" title="Penilaian tidak dapat dimuat" description={reviews.error} />
      ) : reviews.data.access === "ok" && reviews.data.reviews.length > 0 ? (
        <MyKpiReviewList reviews={reviews.data.reviews} />
      ) : (
        <EmptyState
          icon={ClipboardCheck}
          surface="solid"
          title="Belum ada penilaian final"
          description="Penilaian periodik muncul di sini setelah dinilai atasan dan difinalkan pemilik atau admin usaha."
        />
      )}
    </section>
  );
}

// Kinerja milik sendiri: skor KPI per bulan (feature 21) + penilaian periodik final (feature 37). Tanpa referensi desain
// halaman ini — pola /me/attendance (navigasi bulan) + tile "Skor bulan ini" & kartu "Tugas hari ini" snapshot me.html (izin user).
export default async function MyPerformancePage({ searchParams }: Props) {
  await requireActiveEmployee();
  const raw = await searchParams;
  const month = attendanceMonthSchema.safeParse(typeof raw.month === "string" ? raw.month : undefined);
  const [result, reviews] = await Promise.all([fetchMyKpiScore(month.success ? month.data : null), fetchMyKpiReviews()]);

  if (result.ok && result.data.access === "not_linked") {
    return (
      <>
        <PageHeader title="Kinerja saya" description={DESCRIPTION} />
        <FormAlert tone="info">Akun Anda belum tertaut ke data karyawan, jadi belum ada skor KPI. Hubungi admin usaha.</FormAlert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Kinerja saya" description={DESCRIPTION} />
      {result.ok ? (
        <MonthlyScore score={result.data} />
      ) : (
        <EmptyState icon={CloudOff} surface="solid" title="Skor KPI tidak dapat dimuat" description={result.error} />
      )}
      <FinalReviews reviews={reviews} />
    </>
  );
}
