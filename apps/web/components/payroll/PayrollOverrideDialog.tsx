"use client";

import { formatRupiah, PAYROLL_ADJUSTMENT_REASON_MAX, type PayrollAdjustment, payrollAdjustmentInputSchema, type PayrollSalaryItem } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { addPayrollAdjustment, updatePayrollAdjustment } from "@/actions/payrollRuns";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { MoneyField } from "@/components/common/MoneyField";
import { SelectField } from "@/components/common/SelectField";
import { TextAreaField } from "@/components/common/TextAreaField";
import { moneyDigits } from "@/lib/money";
import { COMPONENT_KIND_LABELS } from "@/lib/salaryLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  runId: string;
  employeeId: string;
  // Komponen di versi gaji periode ini
  items: PayrollSalaryItem[];
  // Ada = ubah nominal pengganti yang sudah ada (komponen terkunci)
  adjustment?: PayrollAdjustment;
};

type Errors = Partial<Record<"componentId" | "amount" | "reason", string>>;

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Ganti nominal satu komponen gaji untuk periode ini saja (feature 29) — alasan wajib, tercatat di audit log.
export function PayrollOverrideDialog({ open, onClose, runId, employeeId, items, adjustment }: Props) {
  const router = useRouter();
  const initial = {
    componentId: adjustment?.componentId ?? items[0]?.componentId ?? "",
    amount: adjustment?.amount ? moneyDigits(adjustment.amount) : "",
    reason: adjustment?.reason ?? "",
  };
  const [componentId, setComponentId] = useState(initial.componentId);
  const [amount, setAmount] = useState(initial.amount);
  const [reason, setReason] = useState(initial.reason);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = items.find((item) => item.componentId === componentId);

  function close() {
    setComponentId(initial.componentId);
    setAmount(initial.amount);
    setReason(initial.reason);
    setErrors({});
    setFormError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = payrollAdjustmentInputSchema.safeParse({ kind: "override_component", componentId, amount, reason });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "componentId" || key === "amount" || key === "reason") && !next[key]) next[key] = issue.message;
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
        setAmount("");
        setReason("");
      }
      onClose();
      router.refresh();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  const idPrefix = `payroll-override-${adjustment?.id ?? "new"}`;
  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={adjustment ? `Ubah nominal ${adjustment.componentName ?? "komponen"}` : "Ubah nominal komponen"}
      description="Nominal pengganti hanya berlaku untuk periode ini. Isi nominal sebulan — prorata masa kerja tetap dihitung otomatis."
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <SelectField
          id={`${idPrefix}-component`}
          label="Komponen"
          value={componentId}
          onChange={(e) => setComponentId(e.target.value)}
          error={errors.componentId}
          hint={selected ? `${COMPONENT_KIND_LABELS[selected.kind]} · di gaji karyawan ${formatRupiah(selected.amount)}` : undefined}
          disabled={submitting || adjustment !== undefined}
        >
          {items.map((item) => (
            <option key={item.componentId} value={item.componentId}>
              {item.name}
            </option>
          ))}
        </SelectField>
        <MoneyField
          id={`${idPrefix}-amount`}
          label="Nominal periode ini"
          value={amount}
          onChange={setAmount}
          error={errors.amount}
          hint={selected?.kind === "base_salary" ? undefined : "Isi 0 bila komponen ini tidak dibayar periode ini."}
          disabled={submitting}
        />
        <TextAreaField
          id={`${idPrefix}-reason`}
          label="Alasan"
          placeholder="mis. Uang makan dibayar 15 hari karena cuti"
          maxLength={PAYROLL_ADJUSTMENT_REASON_MAX}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          disabled={submitting}
        />
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
