"use client";

import { KPI_REVIEW_CYCLES, type KpiReviewCycle, type KpiSettings } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { saveKpiSettings } from "@/actions/kpiReviews";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { CYCLE_DESCRIPTIONS, cycleLabel, reviewPeriodLabel, reviewPeriodRange } from "@/lib/kpiReviewLabels";

type Props = {
  settings: KpiSettings;
};

const OPTIONS = KPI_REVIEW_CYCLES.map((cycle) => ({ value: cycle, label: cycleLabel(cycle) }));

// Pilih siklus penilaian KPI (feature 22) — pola WorkScheduleForm (SegmentedControl + simpan di bawah).
// Tanpa referensi desain (izin user): FormSection + SegmentedControl dari design-tokens.html.
export function KpiCycleForm({ settings }: Props) {
  const router = useRouter();
  const [saved, setSaved] = useState(settings);
  const [cycle, setCycle] = useState<KpiReviewCycle>(settings.reviewCycle);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setSubmitting(true);
    try {
      const outcome = await saveKpiSettings({ reviewCycle: cycle });
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setSaved(outcome.settings);
      setStatus({ tone: "success", message: "Siklus penilaian disimpan." });
      router.refresh();
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  const changed = cycle !== saved.reviewCycle;
  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      <SegmentedControl
        label="Siklus penilaian"
        options={OPTIONS}
        value={cycle}
        onChange={(value) => {
          setCycle(value);
          setStatus(null);
        }}
        disabled={submitting}
        fullWidth
        size="lg"
      />
      <p className="text-small text-text-secondary text-pretty">{CYCLE_DESCRIPTIONS[cycle]}</p>
      {changed ? (
        <FormAlert tone="info">Hanya berlaku untuk periode yang dibuat berikutnya. Penilaian yang sudah dibuat tidak berubah, dan periode baru tidak boleh beririsan dengan periode lama.</FormAlert>
      ) : null}

      <div className="mt-2 flex flex-col gap-4 border-t border-border-subtle pt-5">
        {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-text-tertiary">
            Periode berjalan:{" "}
            <span className="font-bold text-text-secondary">{reviewPeriodLabel(saved.reviewCycle, saved.currentPeriod)}</span>
            {saved.reviewCycle === "weekly" ? null : ` · ${reviewPeriodRange(saved.currentPeriod)}`}
          </p>
          <Button type="submit" loading={submitting} disabled={!changed}>
            {submitting ? "Menyimpan…" : "Simpan siklus"}
          </Button>
        </div>
      </div>
    </form>
  );
}
