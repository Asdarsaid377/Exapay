import { ClipboardList, CloudOff, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Banner } from "@/components/common/Banner";
import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { AddBuiltinKpiTemplatesButton } from "@/components/kpi/AddBuiltinKpiTemplatesButton";
import { KpiTemplateCard } from "@/components/kpi/KpiTemplateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchKpiTemplates } from "@/lib/api/kpiTemplates";

export const metadata: Metadata = { title: "Template KPI — Exapay" };

const DESCRIPTION = "Indikator, bobot, dan target kerja per jabatan. Karyawan mencatat tugas harian dari indikator ini.";

// Template KPI per jabatan (feature 18) — owner/admin. Atasan (403 dari API) mendapat 404.
export default async function KpiTemplatesPage() {
  const result = await fetchKpiTemplates();
  if (!result.ok && result.status === 403) notFound();

  const addButton = (
    <Link href="/kpi/templates/new" className={buttonClassName()}>
      <Plus aria-hidden className="size-4.5" />
      Tambah template
    </Link>
  );

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Template KPI" description={DESCRIPTION} />
        <EmptyState icon={CloudOff} title="Template KPI tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const { templates, positions, missingBuiltinCount } = result.data;
  const unassigned = positions.filter((position) => position.templateId === null);

  if (templates.length === 0) {
    return (
      <>
        <PageHeader title="Template KPI" description={DESCRIPTION} />
        <EmptyState
          icon={ClipboardList}
          title="Belum ada template KPI"
          description="Mulai dari template bawaan (Sales, Kasir, Admin Gudang, Staf Produksi) lalu sesuaikan, atau buat sendiri dari awal."
          action={
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {missingBuiltinCount > 0 ? <AddBuiltinKpiTemplatesButton variant="primary" label="Pakai template bawaan" /> : null}
              <Link href="/kpi/templates/new" className={buttonClassName({ variant: missingBuiltinCount > 0 ? "secondary" : "primary" })}>
                Buat dari awal
              </Link>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Template KPI" description={DESCRIPTION} actions={addButton} />
      {unassigned.length > 0 ? (
        <Banner
          tone="warning"
          title={`${unassigned.length} jabatan belum punya template KPI`}
          description={`${unassigned.map((position) => position.name).join(", ")} — karyawannya belum bisa mencatat tugas harian. Pasang lewat menu Ubah pada template.`}
        />
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-2 lg:gap-5">
        {templates.map((template) => (
          <KpiTemplateCard key={template.id} template={template} />
        ))}
      </div>
      {missingBuiltinCount > 0 ? (
        <Banner
          tone="neutral"
          title={`${missingBuiltinCount} template bawaan tidak ada di daftar`}
          description="Tambahkan kembali jika ingin memakainya sebagai titik awal. Template yang sudah ada tidak diubah."
          action={<AddBuiltinKpiTemplatesButton label="Tambahkan template bawaan" />}
        />
      ) : null}
    </>
  );
}
