import type { attendanceDeductionRules } from "@exapay/db";
import type { AttendanceDeductionRules, DeductionRuleVersionStatus } from "@exapay/shared";

// Pemetaan aturan terstruktur ↔ kolom attendance_deduction_rules (feature 17). Kolom yang tidak dipakai mode-nya = null
// (dijaga CHECK di database). Uang tetap string (numeric → "50000.00").

type RuleRow = typeof attendanceDeductionRules.$inferSelect;
export type RuleColumns = Omit<RuleRow, "id" | "tenantId" | "effectiveFrom" | "effectiveTo" | "createdByUserId" | "createdByName" | "createdAt" | "updatedAt">;

function required<T>(value: T | null, column: string): T {
  // CHECK di database menjamin kolom terisi sesuai mode — null di sini berarti data rusak
  if (value === null) throw new Error(`[attendance-deduction/rowToRules] kolom ${column} kosong`);
  return value;
}

export function rulesToColumns(rules: AttendanceDeductionRules): RuleColumns {
  const { absence, late, permitSick, attendanceAllowance } = rules;
  return {
    absenceMode: absence.mode,
    absenceProrateBase: absence.mode === "prorate" ? absence.base : null,
    absenceDivisorMode: absence.mode === "prorate" ? absence.divisor.mode : null,
    absenceDivisorDays: absence.mode === "prorate" && absence.divisor.mode === "fixed" ? absence.divisor.days : null,
    absenceAmountPerDay: absence.mode === "fixed_per_day" ? absence.amountPerDay : null,
    lateMode: late.mode,
    lateToleranceMinutes: late.mode === "none" ? null : late.toleranceMinutes,
    lateBlockMinutes: late.mode === "per_block" ? late.blockMinutes : null,
    lateAmount: late.mode === "per_occurrence" ? late.amountPerOccurrence : late.mode === "per_block" ? late.amountPerBlock : null,
    lateMonthlyCap: late.mode === "none" ? null : late.monthlyCap,
    permitSickMode: permitSick.mode,
    permitSickFreeDays: permitSick.mode === "after_days" ? permitSick.freeDays : null,
    allowanceMode: attendanceAllowance.mode,
    allowanceMinAbsentDays: attendanceAllowance.mode === "forfeit" ? attendanceAllowance.minAbsentDays : null,
    allowanceAmountPerDay: attendanceAllowance.mode === "reduce_per_day" ? attendanceAllowance.amountPerDay : null,
  };
}

function absenceOf(row: RuleColumns): AttendanceDeductionRules["absence"] {
  switch (row.absenceMode) {
    case "none":
      return { mode: "none" };
    case "fixed_per_day":
      return { mode: "fixed_per_day", amountPerDay: required(row.absenceAmountPerDay, "absence_amount_per_day") };
    case "prorate":
      return {
        mode: "prorate",
        base: required(row.absenceProrateBase, "absence_prorate_base"),
        divisor:
          required(row.absenceDivisorMode, "absence_divisor_mode") === "fixed"
            ? { mode: "fixed", days: required(row.absenceDivisorDays, "absence_divisor_days") }
            : { mode: "actual" },
      };
  }
}

function lateOf(row: RuleColumns): AttendanceDeductionRules["late"] {
  switch (row.lateMode) {
    case "none":
      return { mode: "none" };
    case "per_occurrence":
      return {
        mode: "per_occurrence",
        toleranceMinutes: required(row.lateToleranceMinutes, "late_tolerance_minutes"),
        amountPerOccurrence: required(row.lateAmount, "late_amount"),
        monthlyCap: row.lateMonthlyCap,
      };
    case "per_block":
      return {
        mode: "per_block",
        toleranceMinutes: required(row.lateToleranceMinutes, "late_tolerance_minutes"),
        blockMinutes: required(row.lateBlockMinutes, "late_block_minutes"),
        amountPerBlock: required(row.lateAmount, "late_amount"),
        monthlyCap: row.lateMonthlyCap,
      };
  }
}

function permitSickOf(row: RuleColumns): AttendanceDeductionRules["permitSick"] {
  switch (row.permitSickMode) {
    case "none":
      return { mode: "none" };
    case "without_document":
      return { mode: "without_document" };
    case "after_days":
      return { mode: "after_days", freeDays: required(row.permitSickFreeDays, "permit_sick_free_days") };
  }
}

function allowanceOf(row: RuleColumns): AttendanceDeductionRules["attendanceAllowance"] {
  switch (row.allowanceMode) {
    case "none":
      return { mode: "none" };
    case "forfeit":
      return { mode: "forfeit", minAbsentDays: required(row.allowanceMinAbsentDays, "allowance_min_absent_days") };
    case "reduce_per_day":
      return { mode: "reduce_per_day", amountPerDay: required(row.allowanceAmountPerDay, "allowance_amount_per_day") };
  }
}

export function columnsToRules(row: RuleColumns): AttendanceDeductionRules {
  return { absence: absenceOf(row), late: lateOf(row), permitSick: permitSickOf(row), attendanceAllowance: allowanceOf(row) };
}

export function versionStatus(effectiveFrom: string, effectiveTo: string | null, today: string): DeductionRuleVersionStatus {
  if (effectiveFrom > today) return "scheduled";
  return effectiveTo !== null && effectiveTo < today ? "ended" : "active";
}

// "2026-10-15" → "2026-10-14"
export function previousDate(date: string): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
