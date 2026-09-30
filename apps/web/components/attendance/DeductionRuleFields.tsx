"use client";

import {
  ABSENCE_DEDUCTION_MODES,
  ATTENDANCE_ALLOWANCE_MODES,
  LATE_DEDUCTION_MODES,
  PERMIT_SICK_DEDUCTION_MODES,
  PRORATE_BASES,
  WORKING_DAY_DIVISOR_MODES,
} from "@exapay/shared";
import type { ReactNode } from "react";

import { MoneyField } from "@/components/common/MoneyField";
import { SelectField } from "@/components/common/SelectField";
import { TextField } from "@/components/common/TextField";
import {
  ABSENCE_MODE_LABELS,
  ALLOWANCE_MODE_LABELS,
  DIVISOR_MODE_LABELS,
  type DraftErrors,
  LATE_MODE_LABELS,
  PERMIT_SICK_MODE_LABELS,
  PRORATE_BASE_LABELS,
  type RulesDraft,
  sanitizeCountInput,
} from "@/lib/attendanceDeductionLabels";

type Props = {
  draft: RulesDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<RulesDraft>) => void;
  disabled: boolean;
};

type GroupProps = {
  title: string;
  description: string;
  children: ReactNode;
};

function RuleGroup({ title, description, children }: GroupProps) {
  return (
    <section className="flex flex-col gap-4 border-t border-border-subtle py-5 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15px] font-bold text-text-primary">{title}</h3>
        <p className="text-small text-text-secondary text-pretty">{description}</p>
      </div>
      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

// Isian 4 jenis aturan potongan (alpa, telat, izin/sakit, tunjangan kehadiran). Isian tambahan muncul sesuai cara potong.
export function DeductionRuleFields({ draft, errors, onChange, disabled }: Props) {
  const countField = (key: keyof RulesDraft, label: string, hint?: string) => (
    <TextField
      id={`deduction-${key}`}
      label={label}
      inputMode="numeric"
      autoComplete="off"
      value={draft[key]}
      onChange={(e) => onChange({ [key]: sanitizeCountInput(e.target.value) })}
      error={errors[key]}
      hint={hint}
      disabled={disabled}
      className="tabular-nums"
    />
  );

  return (
    <div className="flex flex-col">
      <RuleGroup title="Tidak hadir tanpa izin (alpa)" description="Hari kerja yang sudah lewat tanpa absen dan tanpa izin yang disetujui.">
        <SelectField
          id="deduction-absenceMode"
          label="Cara potong"
          value={draft.absenceMode}
          onChange={(e) => onChange({ absenceMode: ABSENCE_DEDUCTION_MODES.find((mode) => mode === e.target.value) ?? "none" })}
          disabled={disabled}
        >
          {ABSENCE_DEDUCTION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {ABSENCE_MODE_LABELS[mode]}
            </option>
          ))}
        </SelectField>
        {draft.absenceMode === "fixed_per_day" ? (
          <MoneyField
            id="deduction-absenceAmount"
            label="Potongan per hari alpa"
            value={draft.absenceAmount}
            onChange={(absenceAmount) => onChange({ absenceAmount })}
            error={errors.absenceAmount}
            disabled={disabled}
          />
        ) : null}
        {draft.absenceMode === "prorate" ? (
          <>
            <SelectField
              id="deduction-prorateBase"
              label="Dasar prorata"
              value={draft.prorateBase}
              onChange={(e) => onChange({ prorateBase: PRORATE_BASES.find((base) => base === e.target.value) ?? "base_salary" })}
              disabled={disabled}
            >
              {PRORATE_BASES.map((base) => (
                <option key={base} value={base}>
                  {PRORATE_BASE_LABELS[base]}
                </option>
              ))}
            </SelectField>
            <SelectField
              id="deduction-divisorMode"
              label="Pembagi hari kerja"
              value={draft.divisorMode}
              onChange={(e) => onChange({ divisorMode: WORKING_DAY_DIVISOR_MODES.find((mode) => mode === e.target.value) ?? "actual" })}
              hint={draft.divisorMode === "actual" ? "Dari jadwal kerja & hari libur di atas." : undefined}
              disabled={disabled}
            >
              {WORKING_DAY_DIVISOR_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {DIVISOR_MODE_LABELS[mode]}
                </option>
              ))}
            </SelectField>
            {draft.divisorMode === "fixed" ? countField("divisorDays", "Jumlah hari pembagi", "Mis. 25 atau 26 hari.") : null}
          </>
        ) : null}
      </RuleGroup>

      <RuleGroup title="Telat" description="Menit telat dihitung dari jam masuk jadwal. Telat di atas toleransi dihitung penuh sejak jam masuk.">
        <SelectField
          id="deduction-lateMode"
          label="Cara potong"
          value={draft.lateMode}
          onChange={(e) => onChange({ lateMode: LATE_DEDUCTION_MODES.find((mode) => mode === e.target.value) ?? "none" })}
          disabled={disabled}
        >
          {LATE_DEDUCTION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {LATE_MODE_LABELS[mode]}
            </option>
          ))}
        </SelectField>
        {draft.lateMode !== "none" ? (
          <>
            {countField("toleranceMinutes", "Toleransi (menit)", "Telat sampai batas ini tidak dipotong. Isi 0 jika tanpa toleransi.")}
            {draft.lateMode === "per_block" ? countField("blockMinutes", "Panjang blok (menit)", "Tiap kejadian dibulatkan ke atas per blok.") : null}
            <MoneyField
              id="deduction-lateAmount"
              label={draft.lateMode === "per_block" ? "Potongan per blok" : "Potongan per kejadian"}
              value={draft.lateAmount}
              onChange={(lateAmount) => onChange({ lateAmount })}
              error={errors.lateAmount}
              disabled={disabled}
            />
            <MoneyField
              id="deduction-lateCap"
              label="Batas maksimal per bulan"
              value={draft.lateCap}
              onChange={(lateCap) => onChange({ lateCap })}
              error={errors.lateCap}
              hint="Kosongkan jika tanpa batas."
              placeholder="Tanpa batas"
              disabled={disabled}
            />
          </>
        ) : null}
      </RuleGroup>

      <RuleGroup
        title="Izin & sakit"
        description="Hari izin/sakit yang dipotong dinilai sama dengan satu hari alpa. Cuti tidak pernah dipotong."
      >
        <SelectField
          id="deduction-permitSickMode"
          label="Cara potong"
          value={draft.permitSickMode}
          onChange={(e) => onChange({ permitSickMode: PERMIT_SICK_DEDUCTION_MODES.find((mode) => mode === e.target.value) ?? "none" })}
          error={errors.permitSickMode}
          hint={draft.permitSickMode === "without_document" ? "Surat = lampiran pada pengajuan izin/sakit." : undefined}
          disabled={disabled}
        >
          {PERMIT_SICK_DEDUCTION_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {PERMIT_SICK_MODE_LABELS[mode]}
            </option>
          ))}
        </SelectField>
        {draft.permitSickMode === "after_days"
          ? countField("freeDays", "Bebas potong (hari per bulan)", "Izin + sakit di atas jumlah ini dipotong.")
          : null}
      </RuleGroup>

      <RuleGroup title="Tunjangan kehadiran" description="Besar tunjangan diatur di komponen gaji karyawan. Di sini hanya aturan pengurangannya.">
        <SelectField
          id="deduction-allowanceMode"
          label="Aturan"
          value={draft.allowanceMode}
          onChange={(e) => onChange({ allowanceMode: ATTENDANCE_ALLOWANCE_MODES.find((mode) => mode === e.target.value) ?? "none" })}
          disabled={disabled}
        >
          {ATTENDANCE_ALLOWANCE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {ALLOWANCE_MODE_LABELS[mode]}
            </option>
          ))}
        </SelectField>
        {draft.allowanceMode === "forfeit" ? countField("minAbsentDays", "Hangus jika alpa minimal (hari)") : null}
        {draft.allowanceMode === "reduce_per_day" ? (
          <MoneyField
            id="deduction-allowanceAmount"
            label="Berkurang per hari alpa"
            value={draft.allowanceAmount}
            onChange={(allowanceAmount) => onChange({ allowanceAmount })}
            error={errors.allowanceAmount}
            disabled={disabled}
          />
        ) : null}
      </RuleGroup>
    </div>
  );
}
