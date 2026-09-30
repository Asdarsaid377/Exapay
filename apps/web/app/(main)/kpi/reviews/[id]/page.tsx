import { ClipboardCheck, CloudOff, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";

import { Badge } from "@/components/common/Badge";
import { Banner } from "@/components/common/Banner";
import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { KpiIndicatorBreakdown } from "@/components/kpi/KpiIndicatorBreakdown";
import { KpiReviewRatingForm } from "@/components/kpi/KpiReviewRatingForm";
import { KpiReviewsBackLink } from "@/components/kpi/KpiReviewsBackLink";
import { KpiReviewStatusActions } from "@/components/kpi/KpiReviewStatusActions";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchKpiReview } from "@/lib/api/kpiReviews";
import { formatDateTime } from "@/lib/datetime";
import { REVIEW_STATUS_TONES, reviewPeriodLabel, reviewPeriodRange, reviewStatusLabel } from "@/lib/kpiReviewLabels";
import { formatScore, PREDICATE_TONES, predicateLabel } from "@/lib/kpiScoreLabels";

export const metadata: Metadata = { title: "Penilaian KPI — Exapay" };

type Props = {
  params: Promise<{ id: string }>;
};

// Detail penilaian KPI periodik (feature 22): skor + rincian, nilai atasan (draft), finalisasi (owner/admin).
// Tanpa referensi desain — pola /kpi/scores (StatTile + rincian) + FormSection/action bar (izin user).
export default async function KpiReviewDetailPage({ params }: Props) {
  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  const result = parsedId.success ? await fetchKpiReview(parsedId.data) : ({ ok: false, error: "Penilaian tidak ditemukan" } as const);

  if (!result.ok) {
    return (
      <>
        <KpiReviewsBackLink periodId={null} />
        <EmptyState icon={CloudOff} title="Penilaian tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const review = result.data;
  const periodLabel = reviewPeriodLabel(review.period.cycle, review.period);
  const range = reviewPeriodRange(review.period);
  const score = review.result?.score ?? null;
  const predicate = review.result?.predicate ?? null;
  const final = review.status === "final";
  const ratingIndicators = review.result?.indicators.filter((indicator) => indicator.type === "rating") ?? [];

  return (
    <>
      <KpiReviewsBackLink periodId={review.period.id} />
      <PageHeader
        title={review.employee.fullName}
        description={`${review.employee.positionName} · ${review.employee.departmentName} · Penilaian ${periodLabel}${review.period.cycle === "weekly" ? "" : ` (${range})`}`}
        actions={<Badge tone={REVIEW_STATUS_TONES[review.status]}>{reviewStatusLabel(review.status)}</Badge>}
      />

      {final ? (
        <Banner
          tone="neutral"
          icon={Lock}
          title="Penilaian final — skor terkunci"
          description={`Difinalkan ${review.finalizedByName ?? "pemilik/admin"}${review.finalizedAt ? ` pada ${formatDateTime(review.finalizedAt)}` : ""}. Perubahan catatan tugas atau absensi sesudahnya tidak mengubah penilaian ini.`}
        />
      ) : null}
      {review.status === "reviewed" ? (
        <Banner
          tone="warning"
          icon={ClipboardCheck}
          title="Menunggu difinalkan pemilik atau admin"
          description={`Dikirim ${review.submittedByName ?? "atasan"}${review.submittedAt ? ` pada ${formatDateTime(review.submittedAt)}` : ""}. Skor masih dihitung ulang sampai difinalkan.`}
        />
      ) : null}
      {!final && !review.template ? <Banner tone="danger" title="Jabatan karyawan ini belum memakai template KPI" description="Atur template di menu Template KPI agar penilaian bisa dilanjutkan." /> : null}
      {!final && review.pendingTaskLogs > 0 ? (
        <Banner
          tone="warning"
          title={`${review.pendingTaskLogs} catatan tugas di periode ini belum diverifikasi`}
          description="Catatan yang belum disetujui tidak ikut dihitung. Verifikasi dulu agar skor lengkap."
          action={
            <Link href="/kpi/verification" className="text-sm font-bold text-accent-strong hover:text-accent-hover">
              Buka verifikasi
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.85fr)] lg:items-start lg:gap-4">
        <div className="flex flex-col gap-3 lg:gap-4">
          <StatTile
            label={final ? "Skor final" : "Skor sementara"}
            value={score ? formatScore(score) : "–"}
            note={review.template ? `Template ${review.template.name}` : "Tanpa template KPI"}
            badge={predicate ? <Badge tone={PREDICATE_TONES[predicate]}>{predicateLabel(predicate)}</Badge> : null}
          />
          {review.permissions.rate ? <KpiReviewRatingForm reviewId={review.id} version={review.version} indicators={ratingIndicators} /> : null}
          {review.permissions.finalize ? (
            <section className="glass-strong flex flex-col gap-4 rounded-card p-5 lg:p-6">
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-h2 font-bold text-text-primary">Finalisasi</h2>
                <p className="text-small text-text-secondary text-pretty">Periksa rincian skor. Setelah final, penilaian terkunci dan menjadi dasar ringkasan kinerja.</p>
              </div>
              <KpiReviewStatusActions
                reviewId={review.id}
                version={review.version}
                employeeName={`${review.employee.fullName} · ${periodLabel}`}
                scoreLabel={score ? formatScore(score) : null}
                pendingTaskLogs={review.pendingTaskLogs}
              />
            </section>
          ) : null}
        </div>
        <section className="glass-strong flex flex-col gap-1 rounded-card p-5 lg:p-6">
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-h2 font-bold text-text-primary">Rincian skor</h2>
            <p className="text-small text-text-secondary">
              {periodLabel}
              {review.period.cycle === "weekly" ? "" : ` · ${range}`}
            </p>
          </div>
          {review.result ? (
            <KpiIndicatorBreakdown result={review.result} />
          ) : (
            <p className="py-6 text-small text-text-secondary">Rincian tampil setelah jabatan karyawan memakai template KPI.</p>
          )}
        </section>
      </div>
    </>
  );
}
