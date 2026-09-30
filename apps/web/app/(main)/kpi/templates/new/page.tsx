import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmptyState } from "@/components/common/EmptyState";
import { KpiTemplateForm } from "@/components/kpi/KpiTemplateForm";
import { KpiTemplatesBackLink } from "@/components/kpi/KpiTemplatesBackLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchKpiTemplates } from "@/lib/api/kpiTemplates";
import { draftFromTemplate, newIndicatorDraft, type TemplateDraft } from "@/lib/kpiTemplateLabels";

export const metadata: Metadata = { title: "Tambah template KPI — Exapay" };

type Props = {
  // ?from=<id> = salin template tersebut
  searchParams: Promise<{ from?: string | string[] }>;
};

// Template KPI baru (feature 18) — dari awal atau salinan template lain. Owner/admin; atasan (403) mendapat 404.
export default async function NewKpiTemplatePage({ searchParams }: Props) {
  const { from } = await searchParams;
  const result = await fetchKpiTemplates();
  if (!result.ok && result.status === 403) notFound();

  if (!result.ok) {
    return (
      <>
        <KpiTemplatesBackLink />
        <PageHeader title="Tambah template KPI" />
        <EmptyState icon={CloudOff} title="Form tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  // Template sumber tidak ditemukan (mis. sudah dihapus) → mulai dari awal
  const source = typeof from === "string" ? result.data.templates.find((template) => template.id === from) : undefined;
  const initial: TemplateDraft = source
    ? draftFromTemplate(source, "copy")
    : { name: "", description: "", positionIds: [], indicators: [newIndicatorDraft("indicator-1")] };

  return (
    <>
      <div className="-mb-2 flex flex-col gap-1.5">
        <KpiTemplatesBackLink />
        <PageHeader
          title={source ? `Salin template ${source.name}` : "Tambah template KPI"}
          description={
            <>
              Kolom bertanda <span className="text-danger-text">*</span> wajib diisi.
            </>
          }
        />
      </div>
      <KpiTemplateForm templateId={null} initial={initial} positions={result.data.positions} />
    </>
  );
}
