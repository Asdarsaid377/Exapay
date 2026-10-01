"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { finalizePayrollRun } from "@/actions/payrollRuns";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  runId: string;
  // Sidik draf yang sedang ditampilkan — API menolak bila draf berubah sejak halaman dibuka
  fingerprint: string;
  title: string;
  employeeCount: number;
  excludedCount: number;
  // Total gaji diterima (sudah diformat)
  takeHomeLabel: string;
  // Syarat finalisasi belum terpenuhi (alasannya ditampilkan halaman)
  blocked: boolean;
};

// Owner/admin: finalisasi payroll periode (feature 30) — tombol + dialog konfirmasi, pola KpiReviewStatusActions (izin user).
export function PayrollFinalizeAction({ runId, fingerprint, title, employeeCount, excludedCount, takeHomeLabel, blocked }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await finalizePayrollRun(runId, { fingerprint });
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        disabled={blocked}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Finalisasi
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!submitting}
        title="Finalisasi payroll?"
        description={title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} loading={submitting}>
              {submitting ? "Menyimpan…" : "Finalisasi"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <p className="text-body text-pretty text-text-primary">
            Gaji <span className="font-bold tabular-nums">{employeeCount} karyawan</span> dengan total diterima{" "}
            <span className="font-bold tabular-nums">{takeHomeLabel}</span> akan dikunci beserta rinciannya
            {excludedCount > 0 ? ` (${excludedCount} karyawan dikeluarkan)` : ""}.
          </p>
          <p className="text-small text-pretty text-text-secondary">
            Perubahan absensi, gaji, atau aturan sesudahnya tidak mengubah periode ini, dan payroll final tidak bisa dibuka lagi. Koreksi dilakukan lewat
            penyesuaian di periode berikutnya.
          </p>
        </div>
      </Dialog>
    </>
  );
}
