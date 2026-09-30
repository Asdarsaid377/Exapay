import { kpiReviewListQuerySchema } from "@exapay/shared";
import { ClipboardCheck, CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { CreateKpiReviewsButton } from "@/components/kpi/CreateKpiReviewsButton";
import { KpiReviewList } from "@/components/kpi/KpiReviewList";
import { KpiReviewPeriodSelect } from "@/components/kpi/KpiReviewPeriodSelect";
import { MissingReviewsBanner } from "@/components/kpi/MissingReviewsBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchKpiReviews } from "@/lib/api/kpiReviews";
import { cycleLabel, reviewPeriodLabel, reviewPeriodRange } from "@/lib/kpiReviewLabels";

export const metadata: Metadata = { title: "Penilaian KPI — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Penilaian KPI periodik (feature 22): daftar penilaian per periode. Owner/admin: semua karyawan + buat penilaian;
// atasan: bawahan langsung (mengisi nilai & mengirim). Tanpa referensi desain — pola /kpi/scores (izin user).
export default async function KpiReviewsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const query = kpiReviewListQuerySchema.parse({ period: typeof raw.period === "string" ? raw.period : undefined });
  const result = await fetchKpiReviews(query.period ?? null);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Penilaian KPI" />
        <EmptyState icon={CloudOff} title="Penilaian KPI tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;
  const manage = list.scope === "all";
  const header = (
    <PageHeader
      title="Penilaian KPI"
      description={
        manage
          ? `Penilaian resmi per periode (${cycleLabel(list.cycle).toLowerCase()}). Atasan mengisi nilai, pemilik atau admin memfinalkan.`
          : "Penilaian bawahan langsung Anda. Isi nilai indikator penilaian lalu kirim untuk difinalkan."
      }
      actions={manage ? <CreateKpiReviewsButton cycle={list.cycle} candidates={list.candidates} /> : null}
    />
  );

  const period = list.period;
  if (!period) {
    return (
      <>
        {header}
        <EmptyState
          icon={ClipboardCheck}
          title="Belum ada penilaian"
          description={
            manage
              ? list.candidates.length > 0
                ? "Buat penilaian untuk periode yang sudah berakhir. Skor dihitung dari catatan tugas yang disetujui, kehadiran, dan nilai atasan."
                : "Penilaian bisa dibuat setelah periode pertama berakhir."
              : "Pemilik atau admin membuat penilaian setelah periode berakhir. Penilaian bawahan Anda akan muncul di sini."
          }
        />
      </>
    );
  }

  const label = reviewPeriodLabel(period.cycle, period);
  const range = reviewPeriodRange(period);
  const total = period.counts.draft + period.counts.reviewed + period.counts.final;
  return (
    <>
      {header}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <KpiReviewPeriodSelect periods={list.periods} value={period.id} />
        {period.cycle !== list.cycle ? (
          <p className="px-1.5 text-caption text-text-tertiary">Periode ini memakai siklus {cycleLabel(period.cycle).toLowerCase()} (sebelum siklus diganti).</p>
        ) : null}
      </div>
      {manage && list.missingCount > 0 ? <MissingReviewsBanner startDate={period.startDate} count={list.missingCount} /> : null}
      <div className="grid grid-cols-3 gap-3 lg:gap-4">
        <StatTile label="Draf" value={String(period.counts.draft)} note={manage ? "diisi atasan" : "perlu Anda isi"} />
        <StatTile label="Direview" value={String(period.counts.reviewed)} note="menunggu difinalkan" />
        <StatTile label="Final" value={`${period.counts.final}/${total}`} note="skor terkunci" />
      </div>
      {list.rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Tidak ada penilaian untuk Anda di periode ini"
          description="Penilaian bawahan langsung Anda akan muncul di sini."
        />
      ) : (
        <KpiReviewList
          rows={list.rows}
          footer={
            <p className="text-small text-pretty text-text-secondary tabular-nums">
              {list.rows.length} karyawan · {label}
              {period.cycle === "weekly" ? "" : ` · ${range}`} · skor draf & direview dihitung ulang setiap dibuka, skor final tidak berubah lagi
            </p>
          }
        />
      )}
    </>
  );
}
