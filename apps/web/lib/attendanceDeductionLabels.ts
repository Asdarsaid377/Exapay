import {
  type AbsenceDeductionMode,
  type AttendanceAllowanceMode,
  type AttendanceDeductionLineKind,
  type AttendanceDeductionRules,
  type DeductionRuleVersionStatus,
  formatRupiah,
  type LateDeductionMode,
  type PermitSickDeductionMode,
  type ProrateBase,
  type WorkingDayDivisorMode,
} from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { moneyDigits } from "@/lib/money";

// Label & konversi form aturan potongan absensi (feature 17). Tidak menghitung potongan — itu di payroll-engine (API).

export const ABSENCE_MODE_LABELS: Record<AbsenceDeductionMode, string> = {
  none: "Tidak dipotong",
  prorate: "Prorata gaji",
  fixed_per_day: "Nominal tetap per hari",
};
export const PRORATE_BASE_LABELS: Record<ProrateBase, string> = {
  base_salary: "Gaji pokok",
  base_and_fixed_allowances: "Gaji pokok + tunjangan tetap",
};
export const DIVISOR_MODE_LABELS: Record<WorkingDayDivisorMode, string> = {
  actual: "Hari kerja aktual bulan itu",
  fixed: "Angka tetap",
};
export const LATE_MODE_LABELS: Record<LateDeductionMode, string> = {
  none: "Tidak dipotong",
  per_occurrence: "Per kejadian",
  per_block: "Per blok menit",
};
export const PERMIT_SICK_MODE_LABELS: Record<PermitSickDeductionMode, string> = {
  none: "Tidak dipotong",
  without_document: "Dipotong jika tanpa surat",
  after_days: "Dipotong setelah N hari",
};
export const ALLOWANCE_MODE_LABELS: Record<AttendanceAllowanceMode, string> = {
  none: "Tidak ada",
  forfeit: "Hangus jika alpa",
  reduce_per_day: "Berkurang per hari alpa",
};

export const LINE_LABELS: Record<AttendanceDeductionLineKind, string> = {
  absence: "Alpa",
  permit_sick: "Izin & sakit",
  late: "Telat",
  attendance_allowance: "Tunjangan kehadiran berkurang",
};

export const VERSION_STATUS_LABELS: Record<DeductionRuleVersionStatus, string> = {
  active: "Berlaku",
  scheduled: "Terjadwal",
  ended: "Berakhir",
};
export const VERSION_STATUS_TONES: Record<DeductionRuleVersionStatus, BadgeTone> = {
  active: "success",
  scheduled: "info",
  ended: "outline",
};

// ——— Draf form: semua isian sebagai string (uang = digit rupiah tanpa pemisah) ———

export type RulesDraft = {
  absenceMode: AbsenceDeductionMode;
  prorateBase: ProrateBase;
  divisorMode: WorkingDayDivisorMode;
  divisorDays: string;
  absenceAmount: string;
  lateMode: LateDeductionMode;
  toleranceMinutes: string;
  blockMinutes: string;
  lateAmount: string;
  // Kosong = tanpa batas
  lateCap: string;
  permitSickMode: PermitSickDeductionMode;
  freeDays: string;
  allowanceMode: AttendanceAllowanceMode;
  minAbsentDays: string;
  allowanceAmount: string;
};

export function sanitizeCountInput(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 3);
}

// Nilai awal isian yang belum dipakai mode terpilih — contoh umum UMKM
export function draftFromRules(rules: AttendanceDeductionRules): RulesDraft {
  const { absence, late, permitSick, attendanceAllowance } = rules;
  return {
    absenceMode: absence.mode,
    prorateBase: absence.mode === "prorate" ? absence.base : "base_salary",
    divisorMode: absence.mode === "prorate" ? absence.divisor.mode : "actual",
    divisorDays: absence.mode === "prorate" && absence.divisor.mode === "fixed" ? String(absence.divisor.days) : "25",
    absenceAmount: absence.mode === "fixed_per_day" ? moneyDigits(absence.amountPerDay) : "",
    lateMode: late.mode,
    toleranceMinutes: late.mode === "none" ? "15" : String(late.toleranceMinutes),
    blockMinutes: late.mode === "per_block" ? String(late.blockMinutes) : "30",
    lateAmount: late.mode === "per_occurrence" ? moneyDigits(late.amountPerOccurrence) : late.mode === "per_block" ? moneyDigits(late.amountPerBlock) : "",
    lateCap: late.mode !== "none" && late.monthlyCap !== null ? moneyDigits(late.monthlyCap) : "",
    permitSickMode: permitSick.mode,
    freeDays: permitSick.mode === "after_days" ? String(permitSick.freeDays) : "2",
    allowanceMode: attendanceAllowance.mode,
    minAbsentDays: attendanceAllowance.mode === "forfeit" ? String(attendanceAllowance.minAbsentDays) : "1",
    allowanceAmount: attendanceAllowance.mode === "reduce_per_day" ? moneyDigits(attendanceAllowance.amountPerDay) : "",
  };
}

const count = (value: string): number | undefined => (value === "" ? undefined : Number(value));
const amount = (value: string): string | undefined => (value === "" ? undefined : value);

// Draf → bentuk aturan untuk divalidasi attendanceDeductionRulesSchema (isian kosong → pesan "wajib diisi" dari skema)
export function rulesInputFromDraft(draft: RulesDraft): unknown {
  const absence =
    draft.absenceMode === "prorate"
      ? {
          mode: "prorate",
          base: draft.prorateBase,
          divisor: draft.divisorMode === "fixed" ? { mode: "fixed", days: count(draft.divisorDays) } : { mode: "actual" },
        }
      : draft.absenceMode === "fixed_per_day"
        ? { mode: "fixed_per_day", amountPerDay: amount(draft.absenceAmount) }
        : { mode: "none" };
  const monthlyCap = draft.lateCap === "" ? null : draft.lateCap;
  const late =
    draft.lateMode === "per_occurrence"
      ? { mode: "per_occurrence", toleranceMinutes: count(draft.toleranceMinutes), amountPerOccurrence: amount(draft.lateAmount), monthlyCap }
      : draft.lateMode === "per_block"
        ? {
            mode: "per_block",
            toleranceMinutes: count(draft.toleranceMinutes),
            blockMinutes: count(draft.blockMinutes),
            amountPerBlock: amount(draft.lateAmount),
            monthlyCap,
          }
        : { mode: "none" };
  const permitSick = draft.permitSickMode === "after_days" ? { mode: "after_days", freeDays: count(draft.freeDays) } : { mode: draft.permitSickMode };
  const attendanceAllowance =
    draft.allowanceMode === "forfeit"
      ? { mode: "forfeit", minAbsentDays: count(draft.minAbsentDays) }
      : draft.allowanceMode === "reduce_per_day"
        ? { mode: "reduce_per_day", amountPerDay: amount(draft.allowanceAmount) }
        : { mode: "none" };
  return { absence, late, permitSick, attendanceAllowance };
}

// Path isu zod aturan → kunci error isian draf
const ISSUE_FIELDS: Record<string, keyof RulesDraft> = {
  "absence.divisor.days": "divisorDays",
  "absence.amountPerDay": "absenceAmount",
  "late.toleranceMinutes": "toleranceMinutes",
  "late.blockMinutes": "blockMinutes",
  "late.amountPerOccurrence": "lateAmount",
  "late.amountPerBlock": "lateAmount",
  "late.monthlyCap": "lateCap",
  "permitSick.mode": "permitSickMode",
  "permitSick.freeDays": "freeDays",
  "attendanceAllowance.minAbsentDays": "minAbsentDays",
  "attendanceAllowance.amountPerDay": "allowanceAmount",
};

export type DraftErrors = Partial<Record<keyof RulesDraft, string>>;

export function draftErrorsFrom(issues: readonly { path: readonly PropertyKey[]; message: string }[]): DraftErrors {
  const errors: DraftErrors = {};
  for (const issue of issues) {
    const field = ISSUE_FIELDS[issue.path.map(String).join(".")];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

// ——— Ringkasan satu versi (riwayat) ———

export function rulesSummary(rules: AttendanceDeductionRules): { label: string; value: string }[] {
  const { absence, late, permitSick, attendanceAllowance } = rules;
  const absenceText =
    absence.mode === "prorate"
      ? `${PRORATE_BASE_LABELS[absence.base]} ÷ ${absence.divisor.mode === "actual" ? "hari kerja aktual" : `${absence.divisor.days} hari`} per hari alpa`
      : absence.mode === "fixed_per_day"
        ? `${formatRupiah(absence.amountPerDay)} per hari`
        : "Tidak dipotong";
  const cap = late.mode !== "none" && late.monthlyCap !== null ? `, maks. ${formatRupiah(late.monthlyCap)}/bulan` : "";
  const lateText =
    late.mode === "per_occurrence"
      ? `${formatRupiah(late.amountPerOccurrence)} per kejadian (toleransi ${late.toleranceMinutes} menit${cap})`
      : late.mode === "per_block"
        ? `${formatRupiah(late.amountPerBlock)} per ${late.blockMinutes} menit (toleransi ${late.toleranceMinutes} menit${cap})`
        : "Tidak dipotong";
  const permitText =
    permitSick.mode === "without_document"
      ? "Dipotong jika tanpa surat"
      : permitSick.mode === "after_days"
        ? `Dipotong setelah ${permitSick.freeDays} hari per bulan`
        : "Tidak dipotong";
  const allowanceText =
    attendanceAllowance.mode === "forfeit"
      ? `Hangus jika alpa ≥ ${attendanceAllowance.minAbsentDays} hari`
      : attendanceAllowance.mode === "reduce_per_day"
        ? `Berkurang ${formatRupiah(attendanceAllowance.amountPerDay)} per hari alpa`
        : "Tidak ada";
  return [
    { label: "Alpa", value: absenceText },
    { label: "Telat", value: lateText },
    { label: "Izin/sakit", value: permitText },
    { label: "Tunj. kehadiran", value: allowanceText },
  ];
}
