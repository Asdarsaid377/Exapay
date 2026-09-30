import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { FormSection } from "@/components/common/FormSection";
import { KpiCycleForm } from "@/components/kpi/KpiCycleForm";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchKpiSettings } from "@/lib/api/kpiReviews";

export const metadata: Metadata = { title: "Siklus KPI — Exapay" };

// Siklus penilaian KPI periodik (feature 22). Proxy sudah membatasi ke owner/admin; API memeriksa ulang.
// Tanpa referensi desain (izin user) — pola /settings/attendance (FormSection + SegmentedControl).
export default async function SettingsKpiPage() {
  const settings = await fetchKpiSettings();
  const header = <PageHeader title="Siklus KPI" description="Seberapa sering kinerja karyawan dinilai secara resmi oleh atasan dan difinalkan pemilik atau admin." />;

  if (!settings.ok) {
    return (
      <>
        {header}
        <EmptyState icon={CloudOff} title="Siklus KPI tidak dapat dimuat" description={settings.error} />
      </>
    );
  }

  return (
    <>
      {header}
      <FormSection
        title="Siklus penilaian"
        description="Setelah satu periode berakhir, pemilik atau admin membuat penilaian di menu KPI › Penilaian. Skor dihitung otomatis dari catatan tugas yang disetujui, kehadiran, dan nilai atasan."
      >
        <KpiCycleForm settings={settings.data} />
      </FormSection>
    </>
  );
}
