"use client";

import { PAYROLL_ADJUSTMENT_NAME_MAX, type PayrollAdjustment, type PayrollAdjustmentLineKind, payrollAdjustmentInputSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { addPayrollAdjustment, updatePayrollAdjustment } from "@/actions/payrollRuns";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { MoneyField } from "@/components/common/MoneyField";
import { SelectField } from "@/components/common/SelectField";
import { TextField } from "@/components/common/TextField";
import { moneyDigits } from "@/lib/money";

type Props = {
  open: boolean;
  onClose: () => void;
  runId: string;
  employeeId: string;
  // Ada = ubah baris tambahan; tidak ada = tambah baru
  adjustment?: PayrollAdjustment;
};

type Errors = Partial<Record<"lineKind" | "name" | "amount", string>>;

const LINE_KIND_LABELS: Record<PayrollAdjustmentLineKind, string> = {
  variable_allowance: "Pendapatan tidak tetap",
  deduction: "Potongan",
};
const LINE_KIND_HINTS: Record<PayrollAdjustmentLineKind, string> = {
  variable_allowance: "Mis. THR, bonus, insentif. Ikut penghasilan bruto PPh 21, tidak ikut dasar iuran BPJS.",
  deduction: "Mis. kasbon, cicilan. Mengurangi gaji bersih, tidak memengaruhi BPJS dan pajak.",
};
const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Tambah / ubah baris pendapatan tidak tetap atau potongan untuk satu karyawan di periode ini (feature 29).
export function PayrollLineDialog({ open, onClose, runId, employeeId, adjustment }: Props) {
  const router = useRouter();
  const initial = {
    lineKind: adjustment?.lineKind ?? "variable_allowance",
    name: adjustment?.name ?? "",
    amount: adjustment?.amount ? moneyDigits(adjustment.amount) : "",
  };
  const [lineKind, setLineKind] = useState<PayrollAdjustmentLineKind>(initial.lineKind);
  const [name, setName] = useState(initial.name);
  const [amount, setAmount] = useState(initial.amount);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setLineKind(initial.lineKind);
    setName(initial.name);
    setAmount(initial.amount);
    setErrors({});
    setFormError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = payrollAdjustmentInputSchema.safeParse({ kind: "add_line", lineKind, name, amount });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "lineKind" || key === "name" || key === "amount") && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const outcome = adjustment
        ? await updatePayrollAdjustment(runId, adjustment.id, parsed.data)
        : await addPayrollAdjustment(runId, employeeId, parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      if (!adjustment) {
        setName("");
        setAmount("");
      }
      onClose();
      router.refresh();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  const idPrefix = `payroll-line-${adjustment?.id ?? "new"}`;
  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={adjustment ? `Ubah ${adjustment.name ?? "baris tambahan"}` : "Tambah pendapatan / potongan"}
      description="Hanya untuk periode ini. Gaji tetap karyawan tidak berubah."
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <SelectField
          id={`${idPrefix}-kind`}
          label="Jenis"
          value={lineKind}
          onChange={(e) => {
            if (e.target.value === "variable_allowance" || e.target.value === "deduction") setLineKind(e.target.value);
          }}
          error={errors.lineKind}
          hint={LINE_KIND_HINTS[lineKind]}
          disabled={submitting}
        >
          {(["variable_allowance", "deduction"] as const).map((option) => (
            <option key={option} value={option}>
              {LINE_KIND_LABELS[option]}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`${idPrefix}-name`}
          label="Keterangan"
          placeholder={lineKind === "deduction" ? "mis. Kasbon Oktober" : "mis. THR Idulfitri"}
          autoComplete="off"
          maxLength={PAYROLL_ADJUSTMENT_NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={submitting}
        />
        <MoneyField id={`${idPrefix}-amount`} label="Nominal" value={amount} onChange={setAmount} error={errors.amount} disabled={submitting} />
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? "Menyimpan…" : adjustment ? "Simpan" : "Tambah"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
