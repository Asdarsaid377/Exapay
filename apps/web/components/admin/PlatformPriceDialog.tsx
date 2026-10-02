"use client";

import { type BillingPriceVersion, billingPriceInputSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { addPlatformPrice } from "@/actions/adminBilling";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { MoneyField } from "@/components/common/MoneyField";
import { TextField } from "@/components/common/TextField";

type Props = {
  // Versi berlaku hari ini — nilai awal isian
  current: BillingPriceVersion | null;
  // Tanggal paling cepat berlaku (besok, zona platform)
  minDate: string;
};

type Field = "pricePerEmployee" | "minBilledEmployees" | "trialDays" | "graceDays" | "effectiveFrom" | "note";
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ["pricePerEmployee", "minBilledEmployees", "trialDays", "graceDays", "effectiveFrom", "note"];

function isField(value: unknown): value is Field {
  return FIELDS.some((field) => field === value);
}

// Jadwalkan versi harga platform baru (feature 42). Tanpa referensi desain — pola SalaryComponentFormDialog
// (Dialog + field bertumpuk, grid 2 kolom untuk angka), izin user.
export function PlatformPriceDialog({ current, minDate }: Props) {
  const router = useRouter();
  const initial = {
    pricePerEmployee: current ? current.pricePerEmployee.replace(/\.00$/, "") : "",
    minBilledEmployees: String(current?.minBilledEmployees ?? ""),
    trialDays: String(current?.trialDays ?? ""),
    graceDays: String(current?.graceDays ?? ""),
  };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ ...initial, effectiveFrom: minDate, note: "" });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function set(field: Field, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  function close() {
    setOpen(false);
    setValues({ ...initial, effectiveFrom: minDate, note: "" });
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = billingPriceInputSchema.safeParse({ ...values, note: values.note || undefined });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (isField(field) && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    if (parsed.data.effectiveFrom < minDate) {
      setFieldErrors({ effectiveFrom: "Paling cepat berlaku besok" });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const outcome = await addPlatformPrice(parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      close();
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Jadwalkan harga baru
      </Button>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title="Jadwalkan harga baru"
        description="Berlaku untuk tagihan yang terbit mulai tanggal berlaku. Tagihan yang sudah terbit tidak berubah. Jadwal lain pada/sesudah tanggal ini digantikan."
      >
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4.5">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <MoneyField
            id="price-per-employee"
            label="Harga per karyawan aktif / bulan"
            value={values.pricePerEmployee}
            onChange={(digits) => set("pricePerEmployee", digits)}
            error={fieldErrors.pricePerEmployee}
            disabled={submitting}
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField
              id="min-billed"
              label="Minimum ditagih"
              type="number"
              inputMode="numeric"
              min={0}
              value={values.minBilledEmployees}
              onChange={(event) => set("minBilledEmployees", event.target.value)}
              error={fieldErrors.minBilledEmployees}
              hint="karyawan"
              disabled={submitting}
            />
            <TextField
              id="effective-from"
              label="Berlaku mulai"
              type="date"
              min={minDate}
              value={values.effectiveFrom}
              onChange={(event) => set("effectiveFrom", event.target.value)}
              error={fieldErrors.effectiveFrom}
              disabled={submitting}
            />
            <TextField
              id="trial-days"
              label="Lama trial"
              type="number"
              inputMode="numeric"
              min={0}
              value={values.trialDays}
              onChange={(event) => set("trialDays", event.target.value)}
              error={fieldErrors.trialDays}
              hint="hari, untuk usaha baru"
              disabled={submitting}
            />
            <TextField
              id="grace-days"
              label="Masa tenggang"
              type="number"
              inputMode="numeric"
              min={0}
              value={values.graceDays}
              onChange={(event) => set("graceDays", event.target.value)}
              error={fieldErrors.graceDays}
              hint="hari sebelum baca-saja"
              disabled={submitting}
            />
          </div>
          <TextField
            id="price-note"
            label="Catatan (opsional)"
            placeholder="Mis. penyesuaian harga 2027"
            value={values.note}
            onChange={(event) => set("note", event.target.value)}
            error={fieldErrors.note}
            disabled={submitting}
          />
          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? "Menyimpan…" : "Jadwalkan"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
