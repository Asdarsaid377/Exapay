"use client";

import { KPI_INDICATORS_MAX, KPI_WEIGHT_TOTAL, kpiTemplateInputSchema, type KpiPositionOption } from "@exapay/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createKpiTemplate, updateKpiTemplate } from "@/actions/kpiTemplates";
import { Banner } from "@/components/common/Banner";
import { Button, buttonClassName } from "@/components/common/Button";
import { FormSection } from "@/components/common/FormSection";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { type IndicatorErrors, type IndicatorField, KpiIndicatorFields } from "@/components/kpi/KpiIndicatorFields";
import { KpiPositionPicker } from "@/components/kpi/KpiPositionPicker";
import { type IndicatorDraft, newIndicatorDraft, type TemplateDraft, templateInputFromDraft, weightTotal } from "@/lib/kpiTemplateLabels";

type Props = {
  // Tanpa templateId = template baru (termasuk hasil salin)
  templateId: string | null;
  initial: TemplateDraft;
  positions: KpiPositionOption[];
};

type TemplateField = "name" | "description" | "positionIds";

const INDICATOR_FIELDS: readonly IndicatorField[] = ["name", "type", "unit", "target", "targetPeriod", "weight"];

// systemMetric salah = pilihan tipe yang salah
function indicatorFieldOf(value: unknown): IndicatorField | null {
  if (value === "systemMetric") return "type";
  return INDICATOR_FIELDS.find((field) => field === value) ?? null;
}

// Editor template KPI: informasi + jabatan, lalu daftar indikator dengan total bobot yang harus 100%
export function KpiTemplateForm({ templateId, initial, positions }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<TemplateDraft>(initial);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<TemplateField, string>>>({});
  const [indicatorErrors, setIndicatorErrors] = useState<Record<string, IndicatorErrors>>({});
  const [listError, setListError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const total = weightTotal(draft.indicators);
  const editing = templateId !== null;

  function update(patch: Partial<TemplateDraft>, field?: TemplateField) {
    setDraft((current) => ({ ...current, ...patch }));
    if (field) setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setServerError(null);
  }

  function updateIndicator(key: string, patch: Partial<IndicatorDraft>) {
    setDraft((current) => ({ ...current, indicators: current.indicators.map((indicator) => (indicator.key === key ? { ...indicator, ...patch } : indicator)) }));
    setIndicatorErrors((current) => {
      const cleared: IndicatorErrors = { ...current[key] };
      for (const field of Object.keys(patch)) {
        const name = indicatorFieldOf(field);
        if (name) cleared[name] = undefined;
      }
      return { ...current, [key]: cleared };
    });
    if ("weight" in patch) setListError(null);
    setServerError(null);
  }

  function addIndicator() {
    setDraft((current) => ({ ...current, indicators: [...current.indicators, newIndicatorDraft(crypto.randomUUID())] }));
    setListError(null);
  }

  function removeIndicator(key: string) {
    setDraft((current) => ({ ...current, indicators: current.indicators.filter((indicator) => indicator.key !== key) }));
    setListError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const input = templateInputFromDraft(draft);
    const parsed = kpiTemplateInputSchema.safeParse(input);
    if (!parsed.success) {
      const fields: Partial<Record<TemplateField, string>> = {};
      const indicators: Record<string, IndicatorErrors> = {};
      let list: string | null = null;
      for (const issue of parsed.error.issues) {
        const [head, index, field] = issue.path;
        if (head === "indicators" && typeof index === "number") {
          const key = draft.indicators[index]?.key;
          const name = indicatorFieldOf(field);
          if (key && name && !indicators[key]?.[name]) indicators[key] = { ...indicators[key], [name]: issue.message };
          else if (!list) list = issue.message;
        } else if (head === "indicators") {
          list ??= issue.message;
        } else if ((head === "name" || head === "description" || head === "positionIds") && !fields[head]) {
          fields[head] = issue.message;
        }
      }
      setFieldErrors(fields);
      setIndicatorErrors(indicators);
      setListError(list);
      return;
    }

    setSubmitting(true);
    try {
      const outcome = templateId ? await updateKpiTemplate(templateId, input) : await createKpiTemplate(input);
      if (outcome.kind === "error") {
        setServerError(outcome.message);
        return;
      }
      router.push("/kpi/templates");
    } catch {
      setServerError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const totalTone = total === KPI_WEIGHT_TOTAL ? "text-success-text" : "text-warning-text";
  const totalNote = total === KPI_WEIGHT_TOTAL ? "sudah pas" : total < KPI_WEIGHT_TOTAL ? `kurang ${KPI_WEIGHT_TOTAL - total}%` : `lebih ${total - KPI_WEIGHT_TOTAL}%`;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-5">
      {serverError ? <Banner tone="danger" title="Template belum tersimpan" description={serverError} /> : null}

      <FormSection title="Template" description="Nama template dan jabatan yang memakainya.">
        <div className="flex flex-col gap-5">
          <TextField
            id="kpi-template-name"
            label="Nama template"
            requiredMark
            placeholder="mis. Kasir"
            maxLength={80}
            value={draft.name}
            onChange={(e) => update({ name: e.target.value }, "name")}
            error={fieldErrors.name}
            disabled={submitting}
          />
          <TextAreaField
            id="kpi-template-description"
            label="Keterangan (opsional)"
            placeholder="Untuk siapa template ini dan apa yang dinilai"
            maxLength={300}
            rows={2}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value }, "description")}
            error={fieldErrors.description}
            disabled={submitting}
          />
          <KpiPositionPicker
            templateId={templateId}
            positions={positions}
            selected={draft.positionIds}
            error={fieldErrors.positionIds}
            disabled={submitting}
            onChange={(positionIds) => update({ positionIds }, "positionIds")}
          />
        </div>
      </FormSection>

      <FormSection
        title="Indikator"
        description={`Total bobot semua indikator harus ${KPI_WEIGHT_TOTAL}%. Target angka & jumlah diprorata per hari kerja saat skor dihitung; capaian maksimal 120%.`}
      >
        <ul>
          {draft.indicators.map((indicator, index) => (
            <KpiIndicatorFields
              key={indicator.key}
              index={index}
              indicator={indicator}
              errors={indicatorErrors[indicator.key] ?? {}}
              disabled={submitting}
              onRemove={draft.indicators.length > 1 ? () => removeIndicator(indicator.key) : null}
              onChange={(patch) => updateIndicator(indicator.key, patch)}
            />
          ))}
        </ul>
        <div className="mt-1 flex flex-col gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5" aria-live="polite">
            <p className="text-[14.5px] font-bold text-text-primary tabular-nums">
              Total bobot {total}% <span className={`font-medium ${totalTone}`}>· {totalNote}</span>
            </p>
            {listError ? (
              <p role="alert" className="text-caption text-danger-text">
                {listError}
              </p>
            ) : null}
          </div>
          <Button variant="secondary" onClick={addIndicator} disabled={submitting || draft.indicators.length >= KPI_INDICATORS_MAX}>
            <Plus aria-hidden className="size-4.5" />
            Tambah indikator
          </Button>
        </div>
      </FormSection>

      <div className="glass-data sticky bottom-2.5 z-10 flex flex-col gap-3 rounded-[26px] p-2.5 lg:static lg:flex-row lg:items-center lg:justify-between lg:rounded-card lg:py-3 lg:pr-3 lg:pl-5.5">
        <p className="hidden text-small text-text-secondary lg:block">
          {editing ? "Perubahan berlaku untuk pencatatan tugas berikutnya dan tercatat di log audit." : "Template bisa diubah kapan saja setelah disimpan."}
        </p>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2 lg:flex lg:gap-2.5">
          <Link
            href="/kpi/templates"
            aria-disabled={submitting}
            className={buttonClassName({ variant: "secondary", size: "lg", className: `lg:h-11 ${submitting ? "pointer-events-none opacity-60" : ""}` })}
          >
            Batal
          </Link>
          <Button type="submit" size="lg" className="lg:h-11 lg:min-w-33" loading={submitting}>
            {submitting ? "Menyimpan…" : editing ? "Simpan perubahan" : "Simpan template"}
          </Button>
        </div>
      </div>
    </form>
  );
}
