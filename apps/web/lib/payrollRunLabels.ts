import type { AttendanceDeductionFacts, BpjsProgram, PayrollAdjustment, PayrollEmployeeStatus, PayrollRunPeriod, PayrollRunStatus } from "@exapay/shared";
import { formatRupiah } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { monthLabel } from "@/lib/attendanceLabels";
import { formatIsoDate } from "@/lib/datetime";

// Label & tautan run payroll (feature 29) — /payroll, /payroll/[id], /payroll/[id]/employees/[employeeId]

export const RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = { draft: "Draf", final: "Final" };
export const RUN_STATUS_TONES: Record<PayrollRunStatus, BadgeTone> = { draft: "neutral", final: "info" };

export const EMPLOYEE_STATUS_LABELS: Record<PayrollEmployeeStatus, string> = {
  calculated: "Dihitung",
  excluded: "Dikeluarkan",
  no_salary: "Gaji belum diatur",
  error: "Gagal dihitung",
};
export const EMPLOYEE_STATUS_TONES: Record<PayrollEmployeeStatus, BadgeTone> = {
  calculated: "success",
  excluded: "outline",
  no_salary: "warning",
  error: "danger",
};

export const BPJS_LINE_LABELS: Record<BpjsProgram, string> = {
  kesehatan: "BPJS Kesehatan",
  jht: "BPJS TK — Jaminan Hari Tua",
  jp: "BPJS TK — Jaminan Pensiun",
  jkk: "BPJS TK — Jaminan Kecelakaan Kerja",
  jkm: "BPJS TK — Jaminan Kematian",
};

// "Gaji Oktober 2026"
export function runTitle(run: Pick<PayrollRunPeriod, "month">): string {
  return `Gaji ${monthLabel(run.month)}`;
}

// "1 Okt – 31 Okt 2026 · gajian 25 Okt 2026"
export function runPeriodSummary(run: Pick<PayrollRunPeriod, "periodStart" | "periodEnd" | "payDate">): string {
  const range = `${formatIsoDate(run.periodStart)} – ${formatIsoDate(run.periodEnd)}`;
  return run.payDate ? `${range} · gajian ${formatIsoDate(run.payDate)}` : `${range} · tanggal gajian belum diatur`;
}

export function runHref(runId: string): string {
  return `/payroll/${runId}`;
}

export function employeeHref(runId: string, employeeId: string): string {
  return `/payroll/${runId}/employees/${employeeId}`;
}

// Rupiah untuk StatTile (tanpa "Rp" — satuan di label)
export function rupiahNumber(value: string): string {
  return formatRupiah(value).replace(/^(-?)Rp /, "$1");
}

// Potongan ditampilkan dengan tanda minus
export function minusRupiah(value: string): string {
  return /[1-9]/.test(value) ? `−${formatRupiah(value)}` : formatRupiah(value);
}

export function adjustmentTitle(adjustment: PayrollAdjustment): string {
  switch (adjustment.kind) {
    case "add_line":
      return adjustment.name ?? "Baris tambahan";
    case "override_component":
      return `Nominal ${adjustment.componentName ?? "komponen"} periode ini`;
    case "waive_attendance":
      return "Potongan absensi dibatalkan";
    case "exclude":
      return "Dikeluarkan dari periode ini";
  }
}

export function adjustmentValue(adjustment: PayrollAdjustment): string | null {
  if (adjustment.amount === null) return null;
  if (adjustment.kind === "add_line" && adjustment.lineKind === "deduction") return minusRupiah(adjustment.amount);
  return adjustment.kind === "add_line" ? `+${formatRupiah(adjustment.amount)}` : formatRupiah(adjustment.amount);
}

export function factsSummary(facts: AttendanceDeductionFacts): string {
  const items = [
    facts.employedWorkingDays === facts.periodWorkingDays
      ? `${facts.periodWorkingDays} hari kerja`
      : `${facts.employedWorkingDays} dari ${facts.periodWorkingDays} hari kerja (masa kerja)`,
    `Alpa ${facts.absentDays}`,
    `Telat ${facts.lateMinutes.length}×`,
    `Izin ${facts.permitDays}`,
    `Sakit ${facts.sickDays}`,
  ];
  return items.join(" · ");
}
