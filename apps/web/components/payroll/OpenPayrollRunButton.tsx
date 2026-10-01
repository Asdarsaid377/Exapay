"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { openPayrollRun } from "@/actions/payrollRuns";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { SelectField } from "@/components/common/SelectField";
import { monthLabel } from "@/lib/attendanceLabels";
import { runHref } from "@/lib/payrollRunLabels";

type Props = {
  // Bulan yang belum dibuka (terbaru dulu) — dari API
  months: string[];
};

// Buka periode payroll satu bulan (owner/admin, feature 29) — pola CreateKpiReviewsButton (tombol + Dialog).
export function OpenPayrollRunButton({ months }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(months[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await openPayrollRun({ month });
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setOpen(false);
      router.push(runHref(outcome.id));
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setMonth(months[0] ?? "");
          setError(null);
          setOpen(true);
        }}
        disabled={months.length === 0}
        title={months.length === 0 ? "Semua bulan yang bisa dibuka sudah punya periode" : undefined}
      >
        <Plus aria-hidden className="size-4.5" />
        Buka periode
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!submitting}
        title="Buka periode gaji"
        description="Draf dihitung otomatis untuk semua karyawan yang bekerja di bulan itu, dari gaji, absensi, dan aturan potongan yang berlaku."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} loading={submitting} disabled={month === ""}>
              {submitting ? "Membuka…" : "Buka periode"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <SelectField
            id="payroll-run-month"
            label="Bulan"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            disabled={submitting}
            hint="Bulan berjalan sampai 12 bulan ke belakang. Periode = tanggal 1 sampai akhir bulan."
          >
            {months.map((option) => (
              <option key={option} value={option}>
                {monthLabel(option)}
              </option>
            ))}
          </SelectField>
        </div>
      </Dialog>
    </>
  );
}
