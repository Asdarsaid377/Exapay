"use client";

import { deactivateEmployeeSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { deactivateEmployee } from "@/actions/employees";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { firstNameOf, todayIso } from "@/lib/datetime";

type Props = {
  open: boolean;
  onClose: () => void;
  employee: { id: string; fullName: string };
};

// Konfirmasi nonaktifkan karyawan: tanggal keluar wajib, alasan opsional. Data & riwayat tetap tersimpan.
export function DeactivateEmployeeDialog({ open, onClose, employee }: Props) {
  const router = useRouter();
  const [endDate, setEndDate] = useState(todayIso);
  const [endReason, setEndReason] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setError(null);
    setFieldError(undefined);
    onClose();
  }

  async function handleConfirm() {
    setError(null);
    const input = { endDate, endReason };
    const parsed = deactivateEmployeeSchema.safeParse(input);
    if (!parsed.success) {
      setFieldError(parsed.error.issues.find((issue) => issue.path[0] === "endDate")?.message);
      if (!parsed.error.issues.some((issue) => issue.path[0] === "endDate")) setError(parsed.error.issues[0]?.message ?? "Input tidak valid");
      return;
    }
    setFieldError(undefined);
    setSubmitting(true);
    try {
      const outcome = await deactivateEmployee(employee.id, input);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={`Nonaktifkan ${employee.fullName}?`}
      description={`${firstNameOf(employee.fullName)} tidak ikut payroll periode berikutnya. Data dan riwayatnya tetap tersimpan. Akses login dicabut terpisah lewat menu Pengguna.`}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={submitting}>
            {submitting ? "Menonaktifkan…" : "Nonaktifkan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
        <TextField
          id={`deactivate-${employee.id}-date`}
          label="Tanggal keluar"
          requiredMark
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          error={fieldError}
          disabled={submitting}
        />
        <TextAreaField
          id={`deactivate-${employee.id}-reason`}
          label="Alasan"
          placeholder="Opsional, mis. mengundurkan diri"
          value={endReason}
          onChange={(e) => setEndReason(e.target.value)}
          disabled={submitting}
        />
      </div>
    </Dialog>
  );
}
