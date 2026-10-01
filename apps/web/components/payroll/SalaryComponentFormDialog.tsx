"use client";

import { type PayrollComponentKind, type SalaryComponent, salaryComponentInputSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createSalaryComponent, updateSalaryComponent } from "@/actions/salary";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { SelectField } from "@/components/common/SelectField";
import { TextField } from "@/components/common/TextField";
import { COMPONENT_KIND_DESCRIPTIONS, COMPONENT_KIND_LABELS, COMPONENT_KIND_OPTIONS } from "@/lib/salaryLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  // Ada = ubah; tidak ada = tambah baru
  component?: SalaryComponent;
};

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Dialog tambah / ubah komponen gaji (nama + jenis). Jenis terkunci untuk gaji pokok dan komponen yang sudah dipakai.
export function SalaryComponentFormDialog({ open, onClose, component }: Props) {
  const router = useRouter();
  const initialKind: PayrollComponentKind = component?.kind ?? "fixed_allowance";
  const [name, setName] = useState(component?.name ?? "");
  const [kind, setKind] = useState<PayrollComponentKind>(initialKind);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const kindLocked = component !== undefined && (component.kind === "base_salary" || component.inUse);
  // Gaji pokok hanya satu dan bawaan — tidak ditawarkan untuk komponen lain
  const kindOptions = kindLocked ? [initialKind] : COMPONENT_KIND_OPTIONS.filter((option) => option !== "base_salary");

  function close() {
    setName(component?.name ?? "");
    setKind(initialKind);
    setNameError(null);
    setFormError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = salaryComponentInputSchema.safeParse({ name, kind });
    if (!parsed.success) {
      setNameError(parsed.error.issues.find((issue) => issue.path[0] === "name")?.message ?? null);
      return;
    }
    setNameError(null);

    setSubmitting(true);
    try {
      const outcome = component ? await updateSalaryComponent(component.id, parsed.data) : await createSalaryComponent(parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      if (!component) {
        setName("");
        setKind(initialKind);
      }
      onClose();
      router.refresh();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  const idPrefix = `salary-component-${component?.id ?? "new"}`;

  return (
    <Dialog open={open} onClose={close} dismissible={!submitting} title={component ? `Ubah ${component.name}` : "Tambah komponen gaji"}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField
          id={`${idPrefix}-name`}
          label="Nama komponen"
          placeholder="mis. Tunjangan Keluarga"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError ?? undefined}
          disabled={submitting}
        />
        <SelectField
          id={`${idPrefix}-kind`}
          label="Jenis"
          value={kind}
          onChange={(e) => {
            const next = kindOptions.find((option) => option === e.target.value);
            if (next) setKind(next);
          }}
          disabled={submitting || kindLocked}
          hint={
            kindLocked && component?.kind !== "base_salary"
              ? `${COMPONENT_KIND_DESCRIPTIONS[kind]} Jenis tidak bisa diubah karena sudah dipakai di gaji karyawan.`
              : COMPONENT_KIND_DESCRIPTIONS[kind]
          }
        >
          {kindOptions.map((option) => (
            <option key={option} value={option}>
              {COMPONENT_KIND_LABELS[option]}
            </option>
          ))}
        </SelectField>
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? "Menyimpan…" : component ? "Simpan" : "Tambah"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
