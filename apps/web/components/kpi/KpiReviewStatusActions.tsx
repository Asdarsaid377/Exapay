"use client";

import type { KpiReviewStatusAction } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { changeKpiReviewStatus } from "@/actions/kpiReviews";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  reviewId: string;
  version: string;
  employeeName: string;
  // Skor yang akan dikunci (sudah diformat), null = tanpa skor
  scoreLabel: string | null;
  pendingTaskLogs: number;
};

const TITLES: Record<KpiReviewStatusAction, string> = {
  finalize: "Finalkan penilaian?",
  return: "Kembalikan ke draf?",
};

// Owner/admin: finalkan (kunci skor) atau kembalikan ke draf penilaian yang sudah dikirim (feature 22) — pola TaskDecisionActions.
export function KpiReviewStatusActions({ reviewId, version, employeeName, scoreLabel, pendingTaskLogs }: Props) {
  const router = useRouter();
  const [action, setAction] = useState<KpiReviewStatusAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!action) return;
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await changeKpiReviewStatus(reviewId, { action, version });
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setAction(null);
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setAction("return");
          }}
        >
          Kembalikan ke draf
        </Button>
        <Button
          onClick={() => {
            setError(null);
            setAction("finalize");
          }}
        >
          Finalkan
        </Button>
      </div>
      <Dialog
        open={action !== null}
        onClose={() => setAction(null)}
        dismissible={!submitting}
        title={action ? TITLES[action] : ""}
        description={employeeName}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAction(null)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} loading={submitting}>
              {submitting ? "Menyimpan…" : action === "finalize" ? "Finalkan" : "Kembalikan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          {action === "finalize" ? (
            <>
              <p className="text-body text-text-primary text-pretty">
                Skor <span className="font-bold tabular-nums">{scoreLabel ?? "–"}</span> dan rinciannya akan dikunci. Perubahan catatan tugas, absensi, atau
                template sesudahnya tidak mengubah penilaian ini, dan penilaian final tidak bisa dibuka lagi.
              </p>
              {pendingTaskLogs > 0 ? (
                <FormAlert tone="warning">{pendingTaskLogs} catatan tugas di periode ini belum diverifikasi dan tidak ikut dihitung.</FormAlert>
              ) : null}
            </>
          ) : (
            <p className="text-body text-text-primary text-pretty">Atasan bisa mengubah nilai lalu mengirim ulang. Nilai yang sudah diisi tetap tersimpan.</p>
          )}
        </div>
      </Dialog>
    </>
  );
}
