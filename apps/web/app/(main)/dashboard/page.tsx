import { formatRupiah, LEAVE_TYPE_LABELS, LEAVE_TYPES, type OwnerDashboard } from "@exapay/shared";
import { CalendarCheck, ChartNoAxesColumn, CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { ComplianceReminderList } from "@/components/compliance/ComplianceReminderList";
import { MinimumWageBanner } from "@/components/compliance/MinimumWageBanner";
import { AttendanceChartCard } from "@/components/dashboard/AttendanceChartCard";
import { type PendingAction, PendingActionsCard } from "@/components/dashboard/PendingActionsCard";
import { KpiPredicateDistribution } from "@/components/kpi/KpiPredicateDistribution";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchOwnerDashboard } from "@/lib/api/dashboard";
import { getSession } from "@/lib/auth/getSession";
import { monthLabel } from "@/lib/attendanceLabels";
import { firstNameOf, formatIsoDate, greetingFor } from "@/lib/datetime";
import { PREDICATE_TONES, formatScore, predicateLabel } from "@/lib/kpiScoreLabels";
import { formatDateRange } from "@/lib/leaveLabels";
import { RUN_STATUS_LABELS, rupiahNumber, runHref } from "@/lib/payrollRunLabels";

export const metadata: Metadata = { title: "Dashboard — Exapay" };

const LINK = "shrink-0 text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline";

// Dashboard owner/admin (feature 35) — snapshot context/designs/dashboard.html: sapaan + ringkasan, banner upah minimum,
// 4 stat tile, rekap kehadiran + sebaran predikat KPI (1.85fr / 1fr), tindakan tertunda + pengingat kepatuhan (2 kolom;
// mobile: daftar sebelum grafik). Semua angka dari GET /dashboard (= halaman sumbernya). Atasan: versi feature 36.
export default async function DashboardPage() {
  const session = await getSession();
  const tenant = session?.activeTenant;
  const greeting = `${greetingFor(new Date())}, ${firstNameOf(session?.user.fullName ?? "")}`;

  if (tenant?.role !== "owner" && tenant?.role !== "admin") {
    return (
      <>
        <PageHeader title={greeting} description={`Ringkasan ${tenant?.tenantName ?? "usaha Anda"} akan tampil di sini.`} />
        <EmptyState
          icon={ChartNoAxesColumn}
          title="Ringkasan tim segera hadir"
          description="Log tugas yang menunggu verifikasi, pengajuan izin, dan penilaian bawahan akan diringkas di sini. Sementara itu, buka menu Absensi dan KPI."
        />
      </>
    );
  }

  const result = await fetchOwnerDashboard();
  if (!result.ok) {
    return (
      <>
        <PageHeader title={greeting} />
        <EmptyState icon={CloudOff} title="Ringkasan tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const data = result.data;
  const pending = pendingActions(data);
  const waiting =
    data.pending.taskLogs.count + data.pending.leaveRequests.count + data.pending.kpiReviews.count + data.pending.payrollDrafts.length;

  return (
    <>
      <PageHeader title={greeting} description={summaryLine(data, waiting)} />

      <MinimumWageBanner summary={data.minimumWage} />

      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <div className="max-xl:col-span-2">
          <PayrollTile data={data} />
        </div>
        <StatTile
          label="Karyawan aktif"
          value={String(data.employees.active)}
          note={`${data.employees.permanent} tetap · ${data.employees.contract} kontrak · ${data.employees.probation} percobaan`}
        />
        <TodayTile data={data} />
        <div className="max-xl:col-span-2">
          <StatTile
            label="Rata-rata KPI"
            value={data.kpi.averageScore ? formatScore(data.kpi.averageScore) : "—"}
            badge={data.kpi.averagePredicate ? <Badge tone={PREDICATE_TONES[data.kpi.averagePredicate]}>{predicateLabel(data.kpi.averagePredicate)}</Badge> : null}
            note={`${formatDateRange(data.kpi.from, data.kpi.to)} · ${data.kpi.scoredCount} karyawan berskor`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <AttendanceChartCard recap={data.attendance} />
          <KpiPredicateDistribution
            title="Sebaran predikat KPI"
            counts={data.kpi.predicateCounts}
            subtitle={`${data.kpi.scoredCount} karyawan · ${monthLabel(data.kpi.from.slice(0, 7))}`}
            action={
              <Link href="/kpi/scores" className={LINK}>
                Lihat skor
              </Link>
            }
          />
        </div>

        <div className="grid gap-4 max-xl:order-first xl:grid-cols-2">
          <PendingActionsCard items={pending} />
          <RemindersCard data={data} />
        </div>
      </div>
    </>
  );
}

// "Periode Oktober 2026 · payroll masih draf · 3 hal menunggu keputusan Anda."
function summaryLine(data: OwnerDashboard, waiting: number): string {
  const parts = [`Periode ${monthLabel(data.attendance.month)}`];
  if (data.payroll) parts.push(`payroll ${monthLabel(data.payroll.run.month)} ${data.payroll.run.status === "final" ? "sudah final" : "masih draf"}`);
  parts.push(waiting > 0 ? `${waiting} hal menunggu keputusan Anda.` : "tidak ada yang menunggu keputusan Anda.");
  return parts.join(" · ");
}

function pendingActions(data: OwnerDashboard): PendingAction[] {
  const { taskLogs, leaveRequests, kpiReviews, payrollDrafts } = data.pending;
  const items: PendingAction[] = [];
  if (taskLogs.count > 0) {
    items.push({
      key: "tasks",
      title: `${taskLogs.count} log tugas menunggu verifikasi`,
      description: taskLogs.oldestWorkDate ? `Terlama sejak ${formatIsoDate(taskLogs.oldestWorkDate)}` : "Catatan tugas harian karyawan",
      action: "Verifikasi",
      href: "/kpi/verification",
    });
  }
  if (leaveRequests.count > 0) {
    items.push({
      key: "leaves",
      title: `${leaveRequests.count} pengajuan izin menunggu persetujuan`,
      description: LEAVE_TYPES.filter((type) => leaveRequests[type] > 0)
        .map((type) => `${LEAVE_TYPE_LABELS[type]} ${leaveRequests[type]}`)
        .join(" · "),
      action: "Tinjau",
      href: "/attendance/requests",
    });
  }
  if (kpiReviews.count > 0) {
    items.push({
      key: "reviews",
      title: `${kpiReviews.count} penilaian KPI menunggu difinalkan`,
      description: "Sudah dikirim atasan",
      action: "Tinjau",
      href: "/kpi/reviews",
    });
  }
  for (const draft of payrollDrafts) {
    const latest = data.payroll?.run.id === draft.id ? data.payroll : null;
    items.push({
      key: `payroll-${draft.id}`,
      title: `Payroll ${monthLabel(draft.month)} masih draf`,
      description: latest
        ? `${latest.employeeCount} karyawan · bruto ${formatRupiah(latest.grossPay)}`
        : `Periode ${formatDateRange(draft.periodStart, draft.periodEnd)}`,
      action: "Review payroll",
      href: runHref(draft.id),
      primary: true,
    });
  }
  return items;
}

function PayrollTile({ data }: { data: OwnerDashboard }) {
  if (!data.payroll) {
    return <StatTile label="Biaya gaji" value="—" note="Belum ada periode gaji yang dibuka" />;
  }
  const { run, cost, bpjsEmployer } = data.payroll;
  const draft = run.status === "draft";
  return (
    <StatTile
      label={`Biaya gaji ${monthLabel(run.month).split(" ")[0]}`}
      prefix="Rp"
      value={rupiahNumber(cost)}
      badge={<Badge tone={draft ? "warning" : "info"}>{RUN_STATUS_LABELS[run.status]}</Badge>}
      note={`${formatDateRange(run.periodStart, run.periodEnd)} · bruto + BPJS perusahaan ${formatRupiah(bpjsEmployer)}`}
    />
  );
}

function TodayTile({ data }: { data: OwnerDashboard }) {
  const today = data.attendance.days.find((day) => day.date === data.today);
  if (!today || today.expected === 0) {
    return <StatTile label="Kehadiran hari ini" value="—" note="Bukan hari kerja" />;
  }
  const notes = [today.leave > 0 ? `${today.leave} izin` : null, today.pending > 0 ? `${today.pending} belum absen` : null, today.late > 0 ? `${today.late} telat` : null];
  return (
    <StatTile
      label="Kehadiran hari ini"
      value={String(today.onTime + today.late)}
      suffix={`/${today.expected}`}
      note={notes.filter((note) => note !== null).join(" · ") || "Semua sudah absen"}
    />
  );
}

function RemindersCard({ data }: { data: OwnerDashboard }) {
  const { overdue, reminders } = data.compliance;
  return (
    <section aria-labelledby="dashboard-reminders-title" className="glass-strong flex min-w-0 flex-col rounded-card">
      <div className="flex items-center justify-between gap-4 px-5 pt-5 pb-3 lg:px-6">
        <div className="flex items-center gap-2.5">
          <h2 id="dashboard-reminders-title" className="font-display text-h2 font-bold tracking-[-0.01em] text-text-primary">
            Pengingat kepatuhan
          </h2>
          {overdue > 0 ? <Badge tone="danger">{overdue} terlewat</Badge> : null}
        </div>
        <Link href="/compliance" className={LINK}>
          Buka kalender
        </Link>
      </div>
      {reminders.length === 0 ? (
        <EmptyState
          surface="none"
          icon={CalendarCheck}
          iconTone="success"
          title="Tidak ada tenggat dekat"
          description="Belum ada tenggat BPJS, PPh 21, kontrak, atau masa percobaan yang belum selesai dalam 45 hari ke depan."
        />
      ) : (
        <div className="border-t border-border-subtle pb-1">
          <ComplianceReminderList reminders={reminders} actions={false} />
        </div>
      )}
    </section>
  );
}
