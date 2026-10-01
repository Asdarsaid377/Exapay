import {
  type AttendanceDeductionFacts,
  type AttendanceDeductionResult,
  type AttendanceDeductionRules,
  BPJS_PROGRAMS,
  type BpjsContributionLine,
  type BpjsProgram,
  type BpjsRate,
  type JkkRiskLevel,
  type PayrollCalculationResult,
  type PayrollComponentLine,
  type PayrollProration,
} from "@exapay/shared";

import { calculateAttendanceDeduction } from "./attendance-deduction.js";
import { money, type Money, percent, roundRupiah, rupiah, toMoneyString, ZERO } from "./money.js";

// Gaji satu karyawan untuk satu periode: komponen + iuran BPJS (feature 25), prorata masa kerja & potongan absensi
// (feature 27) — fungsi murni. PPh 21 (feature 26) dihitung di atas hasil ini (pph21IncomeFromPayroll).
//
// Aturan perhitungan:
// - Prorata (karyawan masuk/keluar di tengah periode): gaji pokok & tunjangan tetap × hari kerja masa kerja ÷ hari kerja
//   periode, per komponen dibulatkan ke rupiah penuh HALF_UP. Tunjangan tidak tetap & tunjangan kehadiran tidak diprorata.
// - Potongan absensi (alpa, izin/sakit, telat) & pengurangan tunjangan kehadiran dari calculateAttendanceDeduction,
//   memakai gaji pokok & tunjangan tetap sebulan penuh (nilai per hari = sebulan ÷ pembagi).
// - Pendapatan bruto = gaji pokok + tunjangan tetap + tunjangan tidak tetap + tunjangan kehadiran dibayar − potongan absensi
//   → dasar bruto PPh 21 (keputusan feature 27). Potongan lain mengurangi gaji bersih saja.
// - Upah dasar BPJS = gaji pokok + tunjangan tetap sebulan penuh (PP 44/2015, PP 45/2015, PP 46/2015, Perpres 82/2018) —
//   tunjangan tidak tetap/kehadiran tidak ikut; tidak dikurangi prorata maupun potongan absensi (keputusan feature 27).
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

export type PayrollAttendanceInput = {
  // Versi aturan yang berlaku di hari pertama periode (usaha tanpa versi = NO_ATTENDANCE_DEDUCTION_RULES)
  rules: AttendanceDeductionRules;
  // Fakta rekap absensi periode (deductionFacts di API)
  facts: AttendanceDeductionFacts;
};

export type PayrollCalculationInput = {
  components: readonly PayrollComponentLine[];
  bpjs: PayrollBpjsSettings;
  // Tarif BPJS yang berlaku di periode ini (PayrollRegulations.bpjs)
  bpjsRates: readonly BpjsRate[];
  // null = tanpa data absensi: tidak diprorata, tanpa potongan absensi
  attendance: PayrollAttendanceInput | null;
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

function workingDays(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new PayrollInputError(`${label} harus bilangan bulat ≥ 0`);
  return value;
}

// Prorata gaji pokok & tunjangan tetap; null = bekerja sepanjang periode
function prorationOf(
  components: readonly PayrollComponentLine[],
  amounts: Map<PayrollComponentLine, Money>,
  facts: AttendanceDeductionFacts,
  warnings: string[],
): { proration: PayrollProration; paid: Map<PayrollComponentLine, Money> } | null {
  const period = workingDays(facts.periodWorkingDays, "Hari kerja periode");
  const employed = workingDays(facts.employedWorkingDays, "Hari kerja masa kerja");
  if (employed > period) throw new PayrollInputError(`Hari kerja masa kerja (${employed}) melebihi hari kerja periode (${period})`);
  if (period === 0) {
    warnings.push("Tidak ada hari kerja di periode ini — gaji tidak diprorata");
    return null;
  }
  if (employed === period) return null;
  if (employed === 0) warnings.push("Tidak ada hari kerja dalam masa kerja karyawan di periode ini — gaji pokok & tunjangan tetap menjadi 0");

  const steps = [`Masa kerja ${employed} dari ${period} hari kerja periode ini → gaji pokok & tunjangan tetap diprorata`];
  const paid = new Map<PayrollComponentLine, Money>();
  for (const component of components) {
    if (component.kind !== "base_salary" && component.kind !== "fixed_allowance") continue;
    const full = amounts.get(component) ?? ZERO;
    const value = roundRupiah(full.times(employed).div(period));
    paid.set(component, value);
    steps.push(`${component.name}: ${rupiah(full)} × ${employed} ÷ ${period} = ${rupiah(value)}`);
  }
  return { proration: { periodWorkingDays: period, employedWorkingDays: employed, steps }, paid };
}

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const { components, bpjs, bpjsRates, attendance } = input;

  const baseSalaries = components.filter((c) => c.kind === "base_salary");
  if (baseSalaries.length !== 1) throw new PayrollInputError(`Harus ada tepat satu komponen gaji pokok (ditemukan ${baseSalaries.length})`);
  const attendanceAllowances = components.filter((c) => c.kind === "attendance_allowance");
  if (attendanceAllowances.length > 1) throw new PayrollInputError(`Paling banyak satu komponen tunjangan kehadiran (ditemukan ${attendanceAllowances.length})`);
  const amounts = new Map(components.map((c) => [c, amountOf(c)]));
  const totalOf = (kind: PayrollComponentLine["kind"], values: Map<PayrollComponentLine, Money> = amounts): Money =>
    sum(components.filter((c) => c.kind === kind).map((c) => values.get(c) ?? amounts.get(c) ?? ZERO));
  const warnings: string[] = [];

  const prorated = attendance ? prorationOf(components, amounts, attendance.facts, warnings) : null;
  const paidAmounts = prorated?.paid ?? amounts;

  const fullBaseSalary = totalOf("base_salary");
  const fullFixedAllowances = totalOf("fixed_allowance");
  const baseSalary = totalOf("base_salary", paidAmounts);
  const fixedAllowances = totalOf("fixed_allowance", paidAmounts);
  const variableAllowances = totalOf("variable_allowance");
  const attendanceAllowance = totalOf("attendance_allowance");
  const otherDeductions = totalOf("deduction");

  let attendanceResult: AttendanceDeductionResult | null = null;
  if (attendance) {
    // Nilai per hari dari gaji sebulan penuh; batas potongan mengikuti masa kerja (lihat calculateAttendanceDeduction)
    attendanceResult = calculateAttendanceDeduction({
      rules: attendance.rules,
      salary: {
        baseSalary: toMoneyString(fullBaseSalary),
        fixedAllowances: toMoneyString(fullFixedAllowances),
        attendanceAllowance: toMoneyString(attendanceAllowance),
      },
      facts: attendance.facts,
    });
  }
  const attendanceAllowancePaid = attendanceResult ? money(attendanceResult.attendanceAllowancePaid) : attendanceAllowance;
  const attendanceDeductionTotal = attendanceResult ? money(attendanceResult.totalDeduction) : ZERO;

  const earningsTotal = baseSalary.plus(fixedAllowances).plus(variableAllowances).plus(attendanceAllowancePaid);
  const grossPay = earningsTotal.minus(attendanceDeductionTotal);
  const bpjsWage = fullBaseSalary.plus(fullFixedAllowances);

  const steps: string[] = [];
  if (prorated) steps.push(...prorated.proration.steps);
  steps.push(
    `Pendapatan: gaji pokok ${rupiah(baseSalary)} + tunjangan tetap ${rupiah(fixedAllowances)} + tunjangan tidak tetap ${rupiah(variableAllowances)}` +
      (attendanceAllowances.length > 0 ? ` + tunjangan kehadiran ${rupiah(attendanceAllowancePaid)}` : "") +
      ` = ${rupiah(earningsTotal)}`,
  );
  if (attendanceResult) {
    steps.push(
      `Pendapatan bruto: ${rupiah(earningsTotal)} − potongan absensi ${rupiah(attendanceDeductionTotal)} = ${rupiah(grossPay)}`,
    );
  }
  steps.push(`Upah dasar BPJS: gaji pokok + tunjangan tetap${prorated ? " sebulan penuh" : ""} = ${rupiah(bpjsWage)}`);
  if (grossPay.isNegative()) warnings.push("Potongan absensi melebihi pendapatan — pendapatan bruto negatif");

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
    // Komponen yang diprorata membawa nominal periode ini; lainnya komponen asli
    earnings: components
      .filter((c) => c.kind !== "deduction")
      .map((c) => {
        const paid = prorated?.paid.get(c);
        return paid ? { ...c, amount: toMoneyString(paid) } : c;
      }),
    deductions: components.filter((c) => c.kind === "deduction"),
    proration: prorated?.proration ?? null,
    baseSalary: toMoneyString(baseSalary),
    fixedAllowances: toMoneyString(fixedAllowances),
    variableAllowances: toMoneyString(variableAllowances),
    attendanceAllowance: toMoneyString(attendanceAllowance),
    attendanceAllowancePaid: toMoneyString(attendanceAllowancePaid),
    attendance: attendanceResult,
    attendanceDeductionTotal: toMoneyString(attendanceDeductionTotal),
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
