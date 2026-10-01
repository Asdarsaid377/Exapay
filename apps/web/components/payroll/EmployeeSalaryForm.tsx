"use client";

import { BPJS_PROGRAMS, type BpjsProgram, type EmployeeSalaryOverview, SALARY_NOTE_MAX, saveEmployeeSalarySchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { saveEmployeeSalary } from "@/actions/salary";
import { Banner } from "@/components/common/Banner";
import { Button } from "@/components/common/Button";
import { Checkbox } from "@/components/common/Checkbox";
import { FormAlert } from "@/components/common/FormAlert";
import { FormSection } from "@/components/common/FormSection";
import { MoneyField } from "@/components/common/MoneyField";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { formatIsoDate } from "@/lib/datetime";
import { moneyDigits } from "@/lib/money";
import { BPJS_PROGRAM_LABELS, COMPONENT_KIND_LABELS, currentSalaryVersion, JKK_RISK_LABELS } from "@/lib/salaryLabels";

type Props = {
  employeeId: string;
  overview: EmployeeSalaryOverview;
  onCancel: () => void;
  onSaved: () => void;
};

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Tanggal berlaku awal: versi baru = hari ini; gaji pertama = awal bulan berjalan (atau tanggal masuk bila lebih baru)
function defaultEffectiveFrom(overview: EmployeeSalaryOverview): string {
  if (overview.versions.length > 0) return overview.today;
  const monthStart = `${overview.today.slice(0, 8)}01`;
  return overview.joinDate > monthStart ? overview.joinDate : monthStart;
}

// Form versi gaji baru (tab Gaji). Isian awal dari gaji saat ini; komponen kosong = tidak ikut. Simpan = versi baru
// berlaku-tanggal — versi lama tetap di riwayat. Angka & validasi akhir di API.
export function EmployeeSalaryForm({ employeeId, overview, onCancel, onSaved }: Props) {
  const router = useRouter();
  const current = currentSalaryVersion(overview.versions);
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries((current?.items ?? []).map((item) => [item.componentId, moneyDigits(item.amount)])),
  );
  const [programs, setPrograms] = useState<BpjsProgram[]>(() => (current ? current.bpjsPrograms : [...BPJS_PROGRAMS]));
  const [effectiveFrom, setEffectiveFrom] = useState(() => defaultEffectiveFrom(overview));
  const [note, setNote] = useState("");
  const [amountErrors, setAmountErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<{ effectiveFrom?: string; note?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const activeIds = new Set(overview.components.map((component) => component.id));
  const droppedItems = (current?.items ?? []).filter((item) => !activeIds.has(item.componentId));
  const replaced = effectiveFrom ? overview.versions.filter((version) => version.effectiveFrom >= effectiveFrom) : [];

  function toggleProgram(program: BpjsProgram, checked: boolean) {
    setPrograms((previous) => BPJS_PROGRAMS.filter((candidate) => (candidate === program ? checked : previous.includes(candidate))));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const filled = overview.components.filter((component) => (amounts[component.id] ?? "") !== "");
    const parsed = saveEmployeeSalarySchema.safeParse({
      effectiveFrom,
      items: filled.map((component) => ({ componentId: component.id, amount: amounts[component.id] ?? "" })),
      bpjsPrograms: programs,
      note,
    });

    const nextAmountErrors: Record<string, string> = {};
    const base = overview.components.find((component) => component.kind === "base_salary");
    if (base && (amounts[base.id] ?? "") === "") nextAmountErrors[base.id] = "Gaji pokok wajib diisi";
    const nextFieldErrors: { effectiveFrom?: string; note?: string } = {};
    if (effectiveFrom && effectiveFrom < overview.joinDate) nextFieldErrors.effectiveFrom = "Tidak boleh sebelum tanggal masuk karyawan";
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [field, index, key] = issue.path;
        if (field === "items" && typeof index === "number" && key === "amount") {
          const component = filled[index];
          if (component && !nextAmountErrors[component.id]) nextAmountErrors[component.id] = issue.message;
        } else if ((field === "effectiveFrom" || field === "note") && !nextFieldErrors[field]) {
          nextFieldErrors[field] = issue.message;
        }
      }
    }
    setAmountErrors(nextAmountErrors);
    setFieldErrors(nextFieldErrors);
    const fieldErrorCount = Object.keys(nextAmountErrors).length + Object.keys(nextFieldErrors).length;
    // Kesalahan yang tidak terikat satu isian (mis. jumlah komponen) tampil di banner
    if (!parsed.success && fieldErrorCount === 0) setFormError(parsed.error.issues[0]?.message ?? "Isian belum lengkap");
    if (!parsed.success || fieldErrorCount > 0) return;

    setSubmitting(true);
    try {
      const outcome = await saveEmployeeSalary(employeeId, parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 lg:gap-5">
      {formError ? <Banner tone="danger" title="Gaji belum tersimpan" description={formError} /> : null}

      <FormSection
        title="Komponen gaji"
        description="Isi nominal per bulan. Kosongkan komponen yang tidak diterima karyawan ini. THR dan insentif yang tidak rutin bisa ditambahkan saat menyusun payroll."
      >
        <div className="flex flex-col gap-5">
          {droppedItems.length > 0 ? (
            <FormAlert tone="warning">
              {droppedItems.map((item) => item.name).join(", ")} sudah diarsipkan dan tidak ikut di gaji baru.
            </FormAlert>
          ) : null}
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            {overview.components.map((component) => (
              <MoneyField
                key={component.id}
                id={`salary-item-${component.id}`}
                label={component.name}
                requiredMark={component.kind === "base_salary"}
                value={amounts[component.id] ?? ""}
                onChange={(digits) => {
                  setAmounts((previous) => ({ ...previous, [component.id]: digits }));
                  setAmountErrors((previous) => {
                    const next = { ...previous };
                    delete next[component.id];
                    return next;
                  });
                }}
                error={amountErrors[component.id]}
                hint={COMPONENT_KIND_LABELS[component.kind]}
                disabled={submitting}
              />
            ))}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Kepesertaan BPJS"
        description={`Program yang diikuti karyawan ini. JKK memakai ${JKK_RISK_LABELS[overview.jkkRiskLevel].toLowerCase()} — ubah di Pengaturan › Komponen gaji.`}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">Program BPJS</legend>
          <ul className="flex flex-col rounded-field border border-border-control bg-control">
            {BPJS_PROGRAMS.map((program) => (
              <li key={program} className="border-t border-border-subtle first:border-t-0">
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2.5 has-disabled:cursor-default">
                  <Checkbox checked={programs.includes(program)} onChange={(e) => toggleProgram(program, e.target.checked)} disabled={submitting} />
                  <span className="text-[14.5px] font-bold text-text-primary">{BPJS_PROGRAM_LABELS[program]}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </FormSection>

      <FormSection title="Tanggal berlaku" description="Gaji yang sedang berjalan berakhir sehari sebelumnya dan tetap tersimpan di riwayat.">
        <div className="flex flex-col gap-5">
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">
            <TextField
              id="salary-effectiveFrom"
              label="Berlaku mulai"
              type="date"
              min={overview.joinDate}
              value={effectiveFrom}
              onChange={(e) => {
                setEffectiveFrom(e.target.value);
                setFieldErrors((previous) => ({ ...previous, effectiveFrom: undefined }));
              }}
              error={fieldErrors.effectiveFrom}
              hint={`Paling awal tanggal masuk, ${formatIsoDate(overview.joinDate)}.`}
              disabled={submitting}
              className="tabular-nums"
            />
          </div>
          {replaced.length > 0 ? (
            <FormAlert tone="warning">
              Gaji yang berlaku mulai {replaced.map((version) => formatIsoDate(version.effectiveFrom)).join(", ")} akan digantikan gaji ini.
            </FormAlert>
          ) : null}
          <TextAreaField
            id="salary-note"
            label="Catatan (opsional)"
            placeholder="mis. Kenaikan gaji tahunan"
            rows={2}
            maxLength={SALARY_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            error={fieldErrors.note}
            disabled={submitting}
          />
        </div>
      </FormSection>

      <div className="glass-data sticky bottom-2.5 z-10 flex flex-col gap-3 rounded-[26px] p-2.5 lg:static lg:flex-row lg:items-center lg:justify-between lg:rounded-card lg:py-3 lg:pr-3 lg:pl-5.5">
        <p className="hidden text-small text-text-secondary lg:block">Perubahan gaji tercatat di log audit.</p>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2 lg:flex lg:gap-2.5">
          <Button variant="secondary" size="lg" className="lg:h-11" onClick={onCancel} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" size="lg" className="lg:h-11 lg:min-w-33" loading={submitting}>
            {submitting ? "Menyimpan…" : "Simpan gaji"}
          </Button>
        </div>
      </div>
    </form>
  );
}
