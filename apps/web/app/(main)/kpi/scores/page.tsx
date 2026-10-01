import { CloudOff, Users } from "lucide-react";
import type { Metadata } from "next";

import { AttendancePeriodNav } from "@/components/attendance/AttendancePeriodNav";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { KpiPredicateDistribution } from "@/components/kpi/KpiPredicateDistribution";
import { KpiScoreList } from "@/components/kpi/KpiScoreList";
import { KpiScoreTeamSelect } from "@/components/kpi/KpiScoreTeamSelect";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchKpiScores } from "@/lib/api/kpiScores";
import { periodViewOf } from "@/lib/attendanceRecapLabels";
import { formatScore, kpiScoreQueryFrom, PREDICATE_TONES, predicateLabel } from "@/lib/kpiScoreLabels";
import { formatDateRange } from "@/lib/leaveLabels";

export const metadata: Metadata = { title: "Skor KPI — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RANGE_HINT = "Maksimal 92 hari. Skor dihitung sampai hari ini.";

// Skor KPI ad-hoc (feature 21) untuk rentang bebas, per karyawan & tim (departemen). Owner/admin: semua karyawan; atasan: bawahan langsung.
// Tanpa referensi desain halaman ini — pola /attendance (periode + StatTile + daftar) + card "Sebaran predikat KPI" dashboard.html (izin user).
export default async function KpiScoresPage({ searchParams }: Props) {
  const query = kpiScoreQueryFrom(await searchParams);
  const result = await fetchKpiScores(query);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Skor KPI" />
        <EmptyState icon={CloudOff} title="Skor KPI tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;
  const manage = list.scope === "all";
  const currentMonth = list.today.slice(0, 7);
  const view = periodViewOf(query, currentMonth);
  const scoredCount = list.rows.filter((row) => row.result?.score).length;
  const withoutTemplate = list.rows.filter((row) => row.template === null).length;
  const period = formatDateRange(list.from, list.to);
  const averagePredicate = list.averagePredicate;

  return (
    <>
      <PageHeader
        title="Skor KPI"
        description={manage ? "Skor kinerja karyawan untuk rentang bebas, dari catatan tugas yang disetujui atasan." : "Skor kinerja bawahan langsung Anda · hanya baca."}
      />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
        <div className="min-w-0 flex-1">
          <AttendancePeriodNav
            view={view}
            currentMonth={currentMonth}
            from={list.from}
            to={list.requestedTo}
            basePath="/kpi/scores"
            keep={list.departmentId ? { team: list.departmentId } : {}}
            rangeHint={RANGE_HINT}
          />
        </div>
        {list.departments.length > 1 || list.departmentId ? (
          <KpiScoreTeamSelect departments={list.departments} value={list.departmentId} view={view} currentMonth={currentMonth} />
        ) : null}
      </div>
      {list.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={manage ? "Belum ada karyawan di periode ini" : "Belum ada bawahan"}
          description={
            manage
              ? "Skor tampil untuk karyawan yang sudah bekerja pada periode terpilih."
              : "Karyawan yang atasan langsungnya Anda akan muncul di sini. Minta pemilik atau admin mengatur atasan langsung di data karyawan."
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.85fr)] lg:gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
              {/* Tile utama selebar 2 kolom di mobile (snapshot dashboard.html "Rata-rata skor KPI" span 2) */}
              <div className="col-span-2 flex flex-col lg:col-span-1">
              <StatTile
                label="Rata-rata skor"
                value={list.averageScore ? formatScore(list.averageScore) : "–"}
                note={list.averageScore ? period : "Belum ada skor di periode ini"}
                badge={averagePredicate ? <Badge tone={PREDICATE_TONES[averagePredicate]}>{predicateLabel(averagePredicate)}</Badge> : null}
              />
              </div>
              <div className="col-span-2 flex flex-col lg:col-span-1">
              <StatTile
                label="Karyawan dengan skor"
                value={`${scoredCount}/${list.rows.length}`}
                note={withoutTemplate > 0 ? `${withoutTemplate} belum punya template KPI` : "semua jabatan punya template"}
              />
              </div>
            </div>
            <KpiPredicateDistribution counts={list.predicateCounts} subtitle={`${scoredCount} karyawan · ${period}`} />
          </div>
          <KpiScoreList
            rows={list.rows}
            footer={
              <p className="text-small text-pretty text-text-secondary tabular-nums">
                {list.rows.length} karyawan · {period}
                {list.requestedTo > list.to ? " · dihitung sampai hari ini" : ""} · penilaian atasan diisi di penilaian periodik
              </p>
            }
          />
        </>
      )}
    </>
  );
}
