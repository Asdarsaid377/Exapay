import { calculatePayroll, calculatePph21, PayrollInputError, pph21IncomeFromPayroll, takeHomePay } from "@exapay/payroll-engine";
import {
  type AttendanceDeductionFacts,
  type AttendanceDeductionRules,
  type BpjsProgram,
  type JkkRiskLevel,
  NO_ATTENDANCE_DEDUCTION_RULES,
  type PayrollAdjustmentKind,
  type PayrollAdjustmentLineKind,
  type PayrollCalculationResult,
  type PayrollComponentLine,
  type PayrollEmployeeStatus,
  type PayrollRegulations,
  type PayrollSalaryItem,
  type Pph21Result,
  type PtkpStatus,
} from "@exapay/shared";

// Penyusun draf payroll satu karyawan (feature 29) — fungsi murni: data dari database masuk sebagai input, perhitungan
// di payroll-engine. Keputusan user:
// - Periode = bulan kalender; versi gaji = yang berlaku di hari terakhir periode (atau hari terakhir bekerja bila keluar
//   di periode ini) untuk seluruh periode, dengan peringatan bila versi itu mulai di tengah periode.
// - Penyesuaian admin: tambah pendapatan tidak tetap/potongan, ganti nominal komponen (nominal sebulan, sebelum prorata),
//   batalkan potongan absensi (prorata masa kerja tetap), keluarkan karyawan dari periode.
// - PTKP = status karyawan saat draf dihitung (belum ada riwayat status PTKP); dikunci di snapshot final (feature 30).

export type DraftSalaryVersion = {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  items: PayrollSalaryItem[];
  bpjsPrograms: BpjsProgram[];
};

export type DraftAdjustment = {
  id: string;
  kind: PayrollAdjustmentKind;
  lineKind: PayrollAdjustmentLineKind | null;
  name: string | null;
  componentId: string | null;
  amount: string | null;
  reason: string | null;
};

export type DraftEmployeeInput = {
  // Masa pajak 1–12 & rentang bulan
  month: number;
  from: string;
  to: string;
  employee: { joinDate: string; endDate: string | null; ptkpStatus: PtkpStatus };
  // Versi gaji karyawan yang beririsan dengan periode
  salaryVersions: readonly DraftSalaryVersion[];
  adjustments: readonly DraftAdjustment[];
  rules: AttendanceDeductionRules;
  facts: AttendanceDeductionFacts;
  // null = data regulasi periode ini belum lengkap (regulationError berisi penjelasan)
  regulations: PayrollRegulations | null;
  regulationError: string | null;
  minimumWage: string | null;
  jkkRiskLevel: JkkRiskLevel;
};

export type DraftEmployeeResult = {
  status: PayrollEmployeeStatus;
  message: string | null;
  salary: DraftSalaryVersion | null;
  attendanceWaived: boolean;
  result: PayrollCalculationResult | null;
  pph21: Pph21Result | null;
  takeHomePay: string | null;
  warnings: string[];
};

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const MONTH_FORMAT = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });

// "2026-10-15" → "15 Oktober 2026"
export function formatIdDate(date: string): string {
  return DATE_FORMAT.format(new Date(`${date}T00:00:00Z`));
}

// "2026-10" → "Oktober 2026"
export function formatIdMonth(month: string): string {
  return MONTH_FORMAT.format(new Date(`${month}-01T00:00:00Z`));
}

// Hari terakhir yang dibayar di periode: akhir bulan, atau tanggal keluar bila karyawan keluar di periode ini
export function lastPaidDate(to: string, endDate: string | null): string {
  return endDate !== null && endDate < to ? endDate : to;
}

// Versi gaji yang dipakai periode ini (keputusan user: versi yang berlaku di hari terakhir yang dibayar).
// `changedOn` = versi itu mulai berlaku di tengah periode (setelah tanggal 1 dan setelah tanggal masuk) → peringatan.
export function salaryVersionForPeriod(
  versions: readonly DraftSalaryVersion[],
  from: string,
  to: string,
  employment: { joinDate: string; endDate: string | null },
): { version: DraftSalaryVersion | null; changedOn: string | null } {
  const date = lastPaidDate(to, employment.endDate);
  const version = versions.find((v) => v.effectiveFrom <= date && (v.effectiveTo === null || v.effectiveTo >= date)) ?? null;
  const firstPaid = employment.joinDate > from ? employment.joinDate : from;
  return { version, changedOn: version && version.effectiveFrom > firstPaid ? version.effectiveFrom : null };
}

function result(status: PayrollEmployeeStatus, message: string | null, salary: DraftSalaryVersion | null, warnings: string[]): DraftEmployeeResult {
  return { status, message, salary, attendanceWaived: false, result: null, pph21: null, takeHomePay: null, warnings };
}

export function buildEmployeeDraft(input: DraftEmployeeInput): DraftEmployeeResult {
  const { adjustments } = input;
  const warnings: string[] = [];
  const { version, changedOn } = salaryVersionForPeriod(input.salaryVersions, input.from, input.to, input.employee);

  const excluded = adjustments.find((adjustment) => adjustment.kind === "exclude");
  if (excluded) return result("excluded", excluded.reason, version, warnings);
  if (!version) return result("no_salary", "Gaji belum diatur untuk periode ini. Atur di tab Gaji karyawan.", null, warnings);
  if (changedOn) {
    warnings.push(`Gaji berubah mulai ${formatIdDate(changedOn)} — gaji terbaru dipakai untuk seluruh periode. Sesuaikan nominal bila perlu.`);
  }
  if (!input.regulations) return result("error", input.regulationError ?? "Data regulasi payroll periode ini belum tersedia.", version, warnings);

  // Komponen versi gaji + nominal pengganti periode ini + baris tambahan
  const overrides = new Map<string, string>();
  for (const adjustment of adjustments) {
    if (adjustment.kind !== "override_component" || adjustment.componentId === null || adjustment.amount === null) continue;
    if (version.items.some((item) => item.componentId === adjustment.componentId)) overrides.set(adjustment.componentId, adjustment.amount);
    else warnings.push("Ada nominal pengganti untuk komponen yang tidak ada di gaji periode ini — diabaikan. Hapus penyesuaian itu.");
  }
  const components: PayrollComponentLine[] = version.items.map((item) => ({
    code: item.componentId,
    name: item.name,
    kind: item.kind,
    amount: overrides.get(item.componentId) ?? item.amount,
  }));
  for (const adjustment of adjustments) {
    if (adjustment.kind !== "add_line" || adjustment.lineKind === null || adjustment.amount === null) continue;
    components.push({ code: `adjustment:${adjustment.id}`, name: adjustment.name ?? "Penyesuaian", kind: adjustment.lineKind, amount: adjustment.amount });
  }

  // Potongan absensi dibatalkan → aturan kosong; fakta tetap dipakai untuk prorata masa kerja
  const attendanceWaived = adjustments.some((adjustment) => adjustment.kind === "waive_attendance");
  try {
    const payroll = calculatePayroll({
      components,
      bpjs: { programs: version.bpjsPrograms, jkkRiskLevel: input.jkkRiskLevel, minimumWage: input.minimumWage },
      bpjsRates: input.regulations.bpjs,
      attendance: { rules: attendanceWaived ? NO_ATTENDANCE_DEDUCTION_RULES : input.rules, facts: input.facts },
    });
    const endsEmployment = input.employee.endDate !== null && input.employee.endDate <= input.to;
    // TODO feature 30: masa sebelumnya (Pph21PeriodRecord) dari snapshot payroll final tahun yang sama untuk masa pajak terakhir
    const pph21 = calculatePph21({
      ptkpStatus: input.employee.ptkpStatus,
      month: input.month,
      endsEmployment,
      current: { ...pph21IncomeFromPayroll(payroll), religiousContribution: "0" },
      previousPeriods: [],
      previousEmployer: null,
      regulations: input.regulations,
    });
    return {
      status: "calculated",
      message: null,
      salary: version,
      attendanceWaived,
      result: payroll,
      pph21,
      takeHomePay: takeHomePay(payroll, pph21),
      warnings: [...warnings, ...payroll.warnings, ...pph21.warnings],
    };
  } catch (error) {
    if (error instanceof PayrollInputError) return result("error", error.message, version, warnings);
    throw error;
  }
}
