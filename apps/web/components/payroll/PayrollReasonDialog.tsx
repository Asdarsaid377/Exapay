"use client";

import { PAYROLL_ADJUSTMENT_REASON_MAX, payrollAdjustmentInputSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { addPayrollAdjustment } from "@/actions/payrollRuns";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";

type Kind = "waive_attendance" | "exclude";

type Props = {
  open: boolean;
  onClose: () => void;
  runId: string;
  employeeId: string;
  employeeName: string;
  kind: Kind;
};

const COPY: Record<Kind, { title: (name: string) => string; description: string; placeholder: string; button: string }> = {
  waive_attendance: {
    title: (name) => `Batalkan potongan absensi ${name}?`,
    description:
      "Potongan alpa, izin/sakit, telat, dan pengurangan tunjangan kehadiran tidak diterapkan di periode ini. Prorata masa kerja tetap dihitung.",
    placeholder: "mis. Alpa karena banjir, disetujui pemilik",
    button: "Batalkan potongan",
  },
  exclude: {
    title: (name) => `Keluarkan ${name} dari periode ini?`,
    description: "Karyawan tidak dihitung dan tidak masuk total periode ini. Bisa diikutkan kembali selama masih draf.",
    placeholder: "mis. Gaji dibayar terpisah",
    button: "Keluarkan",
  },
};
const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Penyesuaian beralasan tanpa nominal (feature 29): batalkan potongan absensi / keluarkan karyawan dari periode.
export function PayrollReasonDialog({ open, onClose, runId, employeeId, employeeName, kind }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const copy = COPY[kind];

  function close() {
    setReason("");
    setReasonError(null);
    setFormError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = payrollAdjustmentInputSchema.safeParse({ kind, reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? "Alasan wajib diisi");
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    try {
      const outcome = await addPayrollAdjustment(runId, employeeId, parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      setReason("");
      onClose();
      router.refresh();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} dismissible={!submitting} title={copy.title(employeeName)} description={copy.description}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextAreaField
          id={`payroll-${kind}-reason`}
          label="Alasan"
          placeholder={copy.placeholder}
          maxLength={PAYROLL_ADJUSTMENT_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={reasonError ?? undefined}
          disabled={submitting}
        />
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" variant="dark" loading={submitting}>
            {submitting ? "Menyimpan…" : copy.button}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
