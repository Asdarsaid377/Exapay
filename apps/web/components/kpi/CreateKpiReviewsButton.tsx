"use client";

import type { KpiReviewCycle, KpiReviewPeriodRange } from "@exapay/shared";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createKpiReviews } from "@/actions/kpiReviews";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { SelectField } from "@/components/common/SelectField";
import { cycleLabel, reviewPeriodLabel, reviewPeriodRange, reviewsHref } from "@/lib/kpiReviewLabels";

type Props = {
  cycle: KpiReviewCycle;
  // Periode siklus saat ini yang sudah berakhir & belum dibuat (terbaru dulu)
  candidates: KpiReviewPeriodRange[];
};

// Buat penilaian untuk satu periode yang sudah berakhir (owner/admin, feature 22) — pola InviteUserDialog (tombol + Dialog).
export function CreateKpiReviewsButton({ cycle, candidates }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(candidates[0]?.startDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await createKpiReviews({ startDate });
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setOpen(false);
      router.push(reviewsHref(outcome.periodId));
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const selected = candidates.find((candidate) => candidate.startDate === startDate);
  return (
    <>
      <Button
        onClick={() => {
          setStartDate(candidates[0]?.startDate ?? "");
          setError(null);
          setOpen(true);
        }}
        disabled={candidates.length === 0}
        title={candidates.length === 0 ? "Belum ada periode yang berakhir untuk dinilai" : undefined}
      >
        <Plus aria-hidden className="size-4.5" />
        Buat penilaian
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!submitting}
        title="Buat penilaian"
        description={`Satu penilaian dibuat untuk setiap karyawan yang jabatannya memakai template KPI. Siklus: ${cycleLabel(cycle).toLowerCase()}.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} loading={submitting} disabled={!selected}>
              {submitting ? "Membuat…" : "Buat penilaian"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <SelectField
            id="kpi-review-period"
            label="Periode"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={submitting}
            hint={selected ? `${reviewPeriodRange(selected)} · hanya periode yang sudah berakhir` : undefined}
          >
            {candidates.map((candidate) => (
              <option key={candidate.startDate} value={candidate.startDate}>
                {reviewPeriodLabel(cycle, candidate)}
              </option>
            ))}
          </SelectField>
          <p className="text-small text-text-secondary text-pretty">
            Skor dihitung dari catatan tugas yang sudah disetujui. Pastikan catatan tugas periode ini sudah diverifikasi sebelum penilaian difinalkan.
          </p>
        </div>
      </Dialog>
    </>
  );
}
