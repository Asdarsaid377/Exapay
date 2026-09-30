"use client";

import { KPI_RATING_SCALE_MAX, type KpiIndicatorScore } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveKpiReviewRatings } from "@/actions/kpiReviews";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { SegmentedControl } from "@/components/common/SegmentedControl";

type Props = {
  reviewId: string;
  version: string;
  // Indikator tipe penilaian atasan (actual = nilai tersimpan)
  indicators: KpiIndicatorScore[];
};

const SCALE = Array.from({ length: KPI_RATING_SCALE_MAX }, (_, i) => String(i + 1));
const OPTIONS = SCALE.map((value) => ({ value, label: value }));
const SCALE_LABELS: Record<string, string> = { "1": "Sangat kurang", "2": "Kurang", "3": "Cukup", "4": "Baik", "5": "Sangat baik" };

type Pending = "save" | "submit" | null;

// Nilai indikator penilaian atasan (skala 1–5) + kirim untuk direview (feature 22). Simpan = skor dihitung ulang (router.refresh).
// Tanpa referensi desain — SegmentedControl design-tokens.html + action bar form (izin user).
export function KpiReviewRatingForm({ reviewId, version, indicators }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(indicators.flatMap((indicator) => (indicator.actual ? [[indicator.id, String(Number(indicator.actual))]] : []))),
  );
  const [pending, setPending] = useState<Pending>(null);
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const unrated = indicators.filter((indicator) => !values[indicator.id]).length;

  async function send(submit: boolean) {
    setStatus(null);
    if (submit && unrated > 0) {
      setStatus({ tone: "danger", message: `Nilai ${unrated} indikator lagi sebelum mengirim.` });
      return;
    }
    setPending(submit ? "submit" : "save");
    try {
      const ratings = Object.entries(values).map(([indicatorId, rating]) => ({ indicatorId, rating: Number(rating) }));
      const outcome = await saveKpiReviewRatings(reviewId, { version, ratings, submit });
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      if (!submit) setStatus({ tone: "success", message: "Nilai disimpan. Skor sudah dihitung ulang." });
      router.refresh();
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="glass-strong flex flex-col gap-5 rounded-card p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-h2 font-bold text-text-primary">Nilai atasan</h2>
        <p className="text-small text-text-secondary text-pretty">
          {indicators.length > 0
            ? `Skala 1–${KPI_RATING_SCALE_MAX}. Nilai ${KPI_RATING_SCALE_MAX} = capaian 100%. Karyawan tidak melihat nilai sebelum difinalkan.`
            : "Template ini tidak punya indikator penilaian atasan. Periksa rincian skor lalu kirim untuk difinalkan."}
        </p>
      </div>
      {indicators.length > 0 ? (
        <ul className="flex flex-col">
          {indicators.map((indicator) => {
            const value = values[indicator.id] ?? "";
            return (
              <li key={indicator.id} className="flex flex-col gap-2.5 border-t border-border-subtle py-4 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span id={`rating-${indicator.id}`} className="text-[14.5px] font-bold text-text-primary">
                    {indicator.name}
                  </span>
                  <span className="shrink-0 text-caption text-text-tertiary">Bobot {indicator.weight}%</span>
                </div>
                <SegmentedControl
                  label={`Nilai ${indicator.name}`}
                  options={OPTIONS}
                  value={value}
                  onChange={(next) => {
                    setValues((current) => ({ ...current, [indicator.id]: next }));
                    setStatus(null);
                  }}
                  disabled={pending !== null}
                  fullWidth
                  size="lg"
                />
                <span className="text-caption text-text-tertiary">{value ? SCALE_LABELS[value] : "Belum dinilai"}</span>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-col gap-4 border-t border-border-subtle pt-5">
        {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {indicators.length > 0 ? (
            <Button variant="secondary" onClick={() => send(false)} loading={pending === "save"} disabled={pending !== null}>
              {pending === "save" ? "Menyimpan…" : "Simpan nilai"}
            </Button>
          ) : null}
          <Button onClick={() => send(true)} loading={pending === "submit"} disabled={pending !== null}>
            {pending === "submit" ? "Mengirim…" : "Kirim untuk difinalkan"}
          </Button>
        </div>
      </div>
    </section>
  );
}
