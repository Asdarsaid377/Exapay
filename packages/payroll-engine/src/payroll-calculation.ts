import {
  BPJS_PROGRAMS,
  type BpjsContributionLine,
  type BpjsProgram,
  type BpjsRate,
  type JkkRiskLevel,
  type PayrollCalculationResult,
  type PayrollComponentLine,
} from "@exapay/shared";

import { money, type Money, percent, roundRupiah, rupiah, toMoneyString, ZERO } from "./money.js";

// Gaji satu karyawan untuk satu periode: komponen + iuran BPJS (feature 25) — fungsi murni.
// PPh 21 (feature 26) dan potongan absensi (feature 27) menyusul di atas hasil ini.
//
// Aturan perhitungan:
// - Pendapatan = gaji pokok + tunjangan tetap + tunjangan tidak tetap. Potongan lain mengurangi gaji bersih saja.
// - Upah dasar BPJS = gaji pokok + tunjangan tetap (PP 44/2015, PP 45/2015, PP 46/2015, Perpres 82/2018) —
//   tunjangan tidak tetap tidak ikut.
// - Dasar iuran per program = upah dasar, dibatasi `wageCap` versi tarif yang berlaku (null = tanpa batas).
//   BPJS Kesehatan: batas bawah = upah minimum (UMK/UMP) bila datanya ada (Perpres 82/2018); batas atas tetap berlaku.
// - Tarif & batas upah selalu dari data regulasi (feature 24), tidak pernah di-hardcode di sini.
// - Kepesertaan per program dan kelompok risiko JKK adalah input (mis. karyawan usia pensiun tidak ikut JP).
// - Pembulatan: tiap iuran (porsi perusahaan & karyawan) dibulatkan ke rupiah penuh HALF_UP (keputusan feature 17).

export type PayrollBpjsSettings = {
  // Program yang diikuti karyawan ini
  programs: readonly BpjsProgram[];
  // Wajib jika ikut JKK — kelompok risiko usaha
  jkkRiskLevel: JkkRiskLevel | null;
  // Upah minimum (UMK/UMP) yang berlaku di lokasi usaha; null = data tidak tersedia
  minimumWage: string | null;
};

export type PayrollCalculationInput = {
  components: readonly PayrollComponentLine[];
  bpjs: PayrollBpjsSettings;
  // Tarif BPJS yang berlaku di periode ini (PayrollRegulations.bpjs)
  bpjsRates: readonly BpjsRate[];
};

// Input tidak valid / data regulasi kurang — kesalahan pemanggil, bukan kondisi bisnis
export class PayrollInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayrollInputError";
  }
}

const PROGRAM_LABELS: Record<BpjsProgram, string> = {
  kesehatan: "BPJS Kesehatan",
  jht: "JHT",
  jp: "JP",
  jkk: "JKK",
  jkm: "JKM",
};

function amountOf(line: PayrollComponentLine): Money {
  let value: Money;
  try {
    value = money(line.amount);
  } catch {
    throw new PayrollInputError(`Nominal komponen ${line.code} tidak valid: "${line.amount}"`);
  }
  if (!value.isFinite() || value.isNegative()) throw new PayrollInputError(`Nominal komponen ${line.code} harus ≥ 0`);
  return value;
}

function sum(values: readonly Money[]): Money {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

function rateFor(rates: readonly BpjsRate[], program: BpjsProgram, jkkRiskLevel: JkkRiskLevel | null): BpjsRate {
  const rate = rates.find((r) => r.program === program && (program !== "jkk" || r.jkkRiskLevel === jkkRiskLevel));
  if (!rate) {
    const label = program === "jkk" ? `${PROGRAM_LABELS.jkk} risiko ${jkkRiskLevel}` : PROGRAM_LABELS[program];
    throw new PayrollInputError(`Tarif ${label} tidak tersedia untuk periode ini`);
  }
  return rate;
}

function contribution(
  program: BpjsProgram,
  rate: BpjsRate,
  wage: Money,
  minimumWage: Money | null,
): BpjsContributionLine {
  const steps: string[] = [];
  let base = wage;

  if (program === "kesehatan" && minimumWage !== null && base.lt(minimumWage)) {
    steps.push(`Upah ${rupiah(base)} di bawah upah minimum ${rupiah(minimumWage)} → dasar iuran memakai upah minimum`);
    base = minimumWage;
  }
  if (rate.wageCap !== null) {
    const cap = money(rate.wageCap);
    if (base.gt(cap)) {
      steps.push(`Upah ${rupiah(base)} melebihi batas ${rupiah(cap)} → dasar iuran dibatasi`);
      base = cap;
    }
  }
  steps.push(`Dasar iuran ${rupiah(base)}`);

  const employerRate = money(rate.employerRatePercent);
  const employeeRate = money(rate.employeeRatePercent);
  const employerAmount = roundRupiah(base.times(employerRate).div(100));
  const employeeAmount = roundRupiah(base.times(employeeRate).div(100));
  steps.push(`Perusahaan ${percent(rate.employerRatePercent)} × ${rupiah(base)} = ${rupiah(employerAmount)}`);
  steps.push(
    employeeRate.isZero()
      ? "Karyawan: tidak ada iuran (ditanggung perusahaan)"
      : `Karyawan ${percent(rate.employeeRatePercent)} × ${rupiah(base)} = ${rupiah(employeeAmount)}`,
  );

  return {
    program,
    jkkRiskLevel: program === "jkk" ? rate.jkkRiskLevel : null,
    contributionBase: toMoneyString(base),
    employerRatePercent: rate.employerRatePercent,
    employeeRatePercent: rate.employeeRatePercent,
    employerAmount: toMoneyString(employerAmount),
    employeeAmount: toMoneyString(employeeAmount),
    steps,
  };
}

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const { components, bpjs, bpjsRates } = input;

  const baseSalaries = components.filter((c) => c.kind === "base_salary");
  if (baseSalaries.length !== 1) throw new PayrollInputError(`Harus ada tepat satu komponen gaji pokok (ditemukan ${baseSalaries.length})`);
  const amounts = new Map(components.map((c) => [c, amountOf(c)]));
  const totalOf = (kind: PayrollComponentLine["kind"]): Money => sum(components.filter((c) => c.kind === kind).map((c) => amounts.get(c) ?? ZERO));

  const baseSalary = totalOf("base_salary");
  const fixedAllowances = totalOf("fixed_allowance");
  const variableAllowances = totalOf("variable_allowance");
  const otherDeductions = totalOf("deduction");
  const grossPay = baseSalary.plus(fixedAllowances).plus(variableAllowances);
  const bpjsWage = baseSalary.plus(fixedAllowances);

  const steps = [
    `Pendapatan: gaji pokok ${rupiah(baseSalary)} + tunjangan tetap ${rupiah(fixedAllowances)} + tunjangan tidak tetap ${rupiah(variableAllowances)} = ${rupiah(grossPay)}`,
    `Upah dasar BPJS: gaji pokok + tunjangan tetap = ${rupiah(bpjsWage)}`,
  ];
  const warnings: string[] = [];

  const enrolled = new Set(bpjs.programs);
  if (enrolled.has("jkk") && bpjs.jkkRiskLevel === null) throw new PayrollInputError("Kelompok risiko JKK wajib diisi untuk peserta JKK");
  let minimumWage: Money | null = null;
  if (bpjs.minimumWage !== null) {
    minimumWage = money(bpjs.minimumWage);
  } else if (enrolled.has("kesehatan")) {
    warnings.push("Data upah minimum lokasi usaha tidak tersedia — batas bawah dasar iuran BPJS Kesehatan tidak diterapkan");
  }

  const lines = BPJS_PROGRAMS.filter((program) => enrolled.has(program)).map((program) =>
    contribution(program, rateFor(bpjsRates, program, bpjs.jkkRiskLevel), bpjsWage, minimumWage),
  );
  const bpjsEmployerTotal = sum(lines.map((line) => money(line.employerAmount)));
  const bpjsEmployeeTotal = sum(lines.map((line) => money(line.employeeAmount)));
  const totalDeductions = bpjsEmployeeTotal.plus(otherDeductions);
  const netPay = grossPay.minus(totalDeductions);

  steps.push(
    lines.length === 0
      ? "Tidak terdaftar program BPJS"
      : `Iuran BPJS: perusahaan ${rupiah(bpjsEmployerTotal)}, karyawan ${rupiah(bpjsEmployeeTotal)}`,
  );
  steps.push(`Potongan: iuran BPJS karyawan ${rupiah(bpjsEmployeeTotal)} + potongan lain ${rupiah(otherDeductions)} = ${rupiah(totalDeductions)}`);
  steps.push(`Gaji bersih sebelum PPh 21: ${rupiah(grossPay)} − ${rupiah(totalDeductions)} = ${rupiah(netPay)}`);
  if (netPay.isNegative()) warnings.push("Potongan melebihi pendapatan — gaji bersih negatif");

  return {
    earnings: components.filter((c) => c.kind !== "deduction"),
    deductions: components.filter((c) => c.kind === "deduction"),
    baseSalary: toMoneyString(baseSalary),
    fixedAllowances: toMoneyString(fixedAllowances),
    variableAllowances: toMoneyString(variableAllowances),
    grossPay: toMoneyString(grossPay),
    bpjsWage: toMoneyString(bpjsWage),
    bpjs: lines,
    bpjsEmployerTotal: toMoneyString(bpjsEmployerTotal),
    bpjsEmployeeTotal: toMoneyString(bpjsEmployeeTotal),
    otherDeductionsTotal: toMoneyString(otherDeductions),
    totalDeductions: toMoneyString(totalDeductions),
    netPay: toMoneyString(netPay),
    steps,
    warnings,
  };
}
