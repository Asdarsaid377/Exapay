import { type ComplianceReminder, complianceMonthSchema, formatRupiah, minimumWageLabel } from "@exapay/shared";
import { CalendarCheck, CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { StatTile } from "@/components/common/StatTile";
import { ComplianceMonthNav } from "@/components/compliance/ComplianceMonthNav";
import { ComplianceReminderList } from "@/components/compliance/ComplianceReminderList";
import { MinimumWageBanner } from "@/components/compliance/MinimumWageBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchComplianceCalendar } from "@/lib/api/compliance";
import { monthLabel } from "@/lib/attendanceLabels";

export const metadata: Metadata = { title: "Kepatuhan — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DESCRIPTION = "Tenggat setor BPJS, setor & lapor PPh 21, kontrak berakhir, dan masa percobaan selesai. Pemilik & admin menerima email pengingat H-7 dan H-1.";

// Kalender kepatuhan (feature 33): pengingat terlewat (lintas bulan) + daftar tenggat satu bulan, tandai selesai.
// Tanpa referensi desain halaman — turunan kartu "Pengingat kepatuhan" dashboard.html + pola StatTile/OrgListCard (izin user).
// Feature 34: banner upah minimum (pola banner "di bawah UMK" dashboard.html) di atas ringkasan.
export default async function CompliancePage({ searchParams }: Props) {
  const raw = await searchParams;
  const requested = complianceMonthSchema.safeParse(typeof raw.month === "string" ? raw.month : undefined);
  const result = await fetchComplianceCalendar(requested.success ? requested.data : null);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Kepatuhan" description={DESCRIPTION} />
        <EmptyState icon={CloudOff} title="Kalender kepatuhan tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const calendar = result.data;
  const { summary, minimumWage } = calendar;
  const label = monthLabel(calendar.month);
  return (
    <>
      <PageHeader title="Kepatuhan" description={DESCRIPTION} />

      <MinimumWageBanner summary={calendar.minimumWage} />

      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <StatTile
          label="Terlewat"
          value={String(summary.overdue)}
          note="Belum ditandai selesai"
          badge={summary.overdue > 0 ? <Badge tone="danger">Perlu tindakan</Badge> : null}
        />
        <StatTile label="7 hari ke depan" value={String(summary.dueThisWeek)} note="Termasuk hari ini" />
        <StatTile label="Belum selesai" value={String(summary.openThisMonth)} note={label} />
        <StatTile label="Selesai" value={String(summary.doneThisMonth)} note={label} />
      </div>

      {calendar.overdue.length > 0 ? (
        <ReminderCard id="compliance-overdue" title="Terlewat" description="Tenggat yang sudah lewat dan belum ditandai selesai (12 bulan terakhir)." reminders={calendar.overdue} />
      ) : null}

      <ComplianceMonthNav month={calendar.month} currentMonth={calendar.currentMonth} />

      {calendar.reminders.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          iconTone="success"
          title={`Tidak ada tenggat di ${label}`}
          description="Tenggat BPJS & PPh 21 muncul untuk masa yang punya karyawan aktif; kontrak & percobaan dari data karyawan."
        />
      ) : (
        <ReminderCard id="compliance-month" title={label} description="Urut tanggal tenggat." reminders={calendar.reminders} />
      )}

      <p className="px-1.5 text-small text-pretty text-text-secondary">
        Tenggat dari aturan resmi: BPJS Kesehatan tanggal 10 bulan berjalan, BPJS Ketenagakerjaan tanggal 15 bulan berikutnya, setor PPh 21 tanggal 15 dan
        lapor SPT Masa tanggal 20 bulan berikutnya (PMK 81/2024). Jika jatuh pada hari libur, batasnya bergeser ke hari kerja berikutnya.
        {minimumWage.current ? (
          <>
            {" "}
            Upah minimum yang berlaku: {minimumWageLabel(minimumWage.current)} {formatRupiah(minimumWage.current.monthlyAmount)}/bulan, dibandingkan dengan gaji
            pokok + tunjangan tetap karyawan aktif.
          </>
        ) : null}
      </p>
    </>
  );
}

type CardProps = {
  id: string;
  title: string;
  description: string;
  reminders: ComplianceReminder[];
};

function ReminderCard({ id, title, description, reminders }: CardProps) {
  const titleId = `${id}-title`;
  return (
    <section aria-labelledby={titleId} className="glass-strong flex flex-col rounded-card">
      <div className="flex flex-col gap-1 px-5 pt-5 pb-3 lg:px-6">
        <h2 id={titleId} className="font-display text-h2 font-bold text-text-primary">
          {title} <span className="font-medium text-text-tertiary tabular-nums">{reminders.length}</span>
        </h2>
        <p className="text-small text-text-secondary">{description}</p>
      </div>
      <div className="border-t border-border-subtle">
        <ComplianceReminderList reminders={reminders} />
      </div>
    </section>
  );
}
