import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { EmptyState } from "@/components/common/EmptyState";
import { KpiTemplateForm } from "@/components/kpi/KpiTemplateForm";
import { KpiTemplatesBackLink } from "@/components/kpi/KpiTemplatesBackLink";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchKpiTemplates } from "@/lib/api/kpiTemplates";
import { draftFromTemplate } from "@/lib/kpiTemplateLabels";

export const metadata: Metadata = { title: "Ubah template KPI — Exapay" };

type Props = {
  params: Promise<{ id: string }>;
};

// Ubah template KPI (feature 18) — owner/admin. Template tidak ada / atasan (403) → 404.
export default async function EditKpiTemplatePage({ params }: Props) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const result = await fetchKpiTemplates();
  if (!result.ok && result.status === 403) notFound();
  if (!result.ok) {
    return (
      <>
        <KpiTemplatesBackLink />
        <PageHeader title="Ubah template KPI" />
        <EmptyState icon={CloudOff} title="Template KPI tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const template = result.data.templates.find((item) => item.id === id);
  if (!template) notFound();

  return (
    <>
      <div className="-mb-2 flex flex-col gap-1.5">
        <KpiTemplatesBackLink />
        <PageHeader
          title={`Ubah template ${template.name}`}
          description={
            <>
              Kolom bertanda <span className="text-danger-text">*</span> wajib diisi.
            </>
          }
        />
      </div>
      <KpiTemplateForm key={template.updatedAt} templateId={template.id} initial={draftFromTemplate(template, "edit")} positions={result.data.positions} />
    </>
  );
}
