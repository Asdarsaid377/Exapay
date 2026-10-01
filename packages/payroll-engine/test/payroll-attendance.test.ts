import {
  ABSENCE_DEDUCTION_MODES,
  ATTENDANCE_ALLOWANCE_MODES,
  type AttendanceDeductionFacts,
  type AttendanceDeductionRules,
  type BpjsRate,
  LATE_DEDUCTION_MODES,
  NO_ATTENDANCE_DEDUCTION_RULES,
  PERMIT_SICK_DEDUCTION_MODES,
  type PayrollComponentLine,
} from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { calculateAttendanceDeduction } from "../src/attendance-deduction.js";
import { calculatePayroll, type PayrollBpjsSettings, PayrollInputError } from "../src/payroll-calculation.js";
import { pph21IncomeFromPayroll } from "../src/pph21.js";

// Prorata masa kerja & potongan absensi di calculatePayroll (feature 27)

const version = { effectiveFrom: "2024-01-01", effectiveTo: null, source: "test" };
const RATES: BpjsRate[] = [
  { program: "kesehatan", jkkRiskLevel: null, employerRatePercent: "4.0000", employeeRatePercent: "1.0000", wageCap: "12000000.00", ...version },
  { program: "jht", jkkRiskLevel: null, employerRatePercent: "3.7000", employeeRatePercent: "2.0000", wageCap: null, ...version },
];
const BPJS: PayrollBpjsSettings = { programs: ["kesehatan", "jht"], jkkRiskLevel: null, minimumWage: "3921088.00" };
const NO_BPJS: PayrollBpjsSettings = { programs: [], jkkRiskLevel: null, minimumWage: null };

const GAPOK: PayrollComponentLine = { code: "GAPOK", name: "Gaji pokok", kind: "base_salary", amount: "4400000" };
const TUNJ: PayrollComponentLine = { code: "TUNJ_JABATAN", name: "Tunjangan jabatan", kind: "fixed_allowance", amount: "220000" };
const INSENTIF: PayrollComponentLine = { code: "INSENTIF", name: "Insentif", kind: "variable_allowance", amount: "500000" };
const HADIR: PayrollComponentLine = { code: "TUNJ_HADIR", name: "Tunjangan kehadiran", kind: "attendance_allowance", amount: "300000" };

function facts(overrides: Partial<AttendanceDeductionFacts> = {}): AttendanceDeductionFacts {
  return { periodWorkingDays: 22, employedWorkingDays: 22, absentDays: 0, lateMinutes: [], permitDays: 0, sickDays: 0, undocumentedPermitSickDays: 0, ...overrides };
}

const PRORATE_ACTUAL: AttendanceDeductionRules = {
  ...NO_ATTENDANCE_DEDUCTION_RULES,
  absence: { mode: "prorate", base: "base_salary", divisor: { mode: "actual" } },
};

function calc(
  components: PayrollComponentLine[],
  rules: AttendanceDeductionRules | null,
  attendanceFacts: AttendanceDeductionFacts = facts(),
  bpjs: PayrollBpjsSettings = NO_BPJS,
) {
  return calculatePayroll({ components, bpjs, bpjsRates: RATES, attendance: rules ? { rules, facts: attendanceFacts } : null });
}

describe("potongan absensi di payroll", () => {
  it("tanpa aturan (usaha belum punya versi): hasil sama dengan tanpa absensi, potongan 0", () => {
    const withRules = calc([GAPOK, TUNJ, HADIR], NO_ATTENDANCE_DEDUCTION_RULES, facts({ absentDays: 3, lateMinutes: [40] }), BPJS);
    const without = calc([GAPOK, TUNJ, HADIR], null, facts(), BPJS);
    expect(withRules.attendance).toEqual({ lines: [], totalDeduction: "0.00", attendanceAllowancePaid: "300000.00" });
    expect(without.attendance).toBeNull();
    for (const result of [withRules, without]) {
      expect(result).toMatchObject({ attendanceDeductionTotal: "0.00", attendanceAllowancePaid: "300000.00", grossPay: "4920000.00" });
    }
    expect(withRules.netPay).toBe(without.netPay);
  });

  it("alpa mengurangi pendapatan bruto & gaji bersih, tidak mengurangi dasar iuran BPJS", () => {
    const result = calc([GAPOK, TUNJ], PRORATE_ACTUAL, facts({ absentDays: 2 }), BPJS);
    // 4.400.000 × 2 ÷ 22 = 400.000
    expect(result.attendance?.lines).toEqual([expect.objectContaining({ kind: "absence", amount: "400000.00" })]);
    expect(result).toMatchObject({
      baseSalary: "4400000.00",
      fixedAllowances: "220000.00",
      attendanceDeductionTotal: "400000.00",
      grossPay: "4220000.00",
      bpjsWage: "4620000.00",
      // Kesehatan 1% × 4.620.000 = 46.200; JHT 2% = 92.400
      bpjsEmployeeTotal: "138600.00",
      totalDeductions: "138600.00",
      netPay: "4081400.00",
    });
    expect(result.steps).toContain("Pendapatan bruto: Rp 4.620.000 − potongan absensi Rp 400.000 = Rp 4.220.000");
    expect(result.bpjs.map((line) => line.contributionBase)).toEqual(["4620000.00", "4620000.00"]);
  });

  it("tunjangan kehadiran hangus: tidak masuk pendapatan, tidak ikut upah BPJS, tidak menambah potongan", () => {
    const rules: AttendanceDeductionRules = { ...NO_ATTENDANCE_DEDUCTION_RULES, attendanceAllowance: { mode: "forfeit", minAbsentDays: 1 } };
    const result = calc([GAPOK, HADIR], rules, facts({ absentDays: 1 }));
    expect(result).toMatchObject({
      attendanceAllowance: "300000.00",
      attendanceAllowancePaid: "0.00",
      attendanceDeductionTotal: "0.00",
      grossPay: "4400000.00",
      bpjsWage: "4400000.00",
    });
    // Komponen tetap tampil sebesar nominal; pengurangannya di baris attendance
    expect(result.earnings).toEqual([GAPOK, HADIR]);
    expect(result.attendance?.lines).toEqual([expect.objectContaining({ kind: "attendance_allowance", amount: "300000.00" })]);
    expect(result.steps[0]).toBe(
      "Pendapatan: gaji pokok Rp 4.400.000 + tunjangan tetap Rp 0 + tunjangan tidak tetap Rp 0 + tunjangan kehadiran Rp 0 = Rp 4.400.000",
    );
  });

  it("tunjangan kehadiran dibayar penuh ikut pendapatan bruto", () => {
    const rules: AttendanceDeductionRules = { ...NO_ATTENDANCE_DEDUCTION_RULES, attendanceAllowance: { mode: "reduce_per_day", amountPerDay: "50000" } };
    const result = calc([GAPOK, HADIR, INSENTIF], rules, facts({ absentDays: 2 }));
    // 300.000 − 2 × 50.000
    expect(result.attendanceAllowancePaid).toBe("200000.00");
    expect(result.grossPay).toBe("5100000.00");
  });

  it("alpa + izin/sakit tanpa surat + telat, dasar prorata gaji pokok + tunjangan tetap", () => {
    const rules: AttendanceDeductionRules = {
      absence: { mode: "prorate", base: "base_and_fixed_allowances", divisor: { mode: "actual" } },
      permitSick: { mode: "without_document" },
      late: { mode: "per_block", toleranceMinutes: 5, blockMinutes: 15, amountPerBlock: "10000", monthlyCap: null },
      attendanceAllowance: { mode: "none" },
    };
    const result = calc([GAPOK, TUNJ, INSENTIF], rules, facts({ absentDays: 1, permitDays: 2, undocumentedPermitSickDays: 1, lateMinutes: [3, 16, 45] }));
    // 4.620.000 ÷ 22 = 210.000 per hari → alpa 210.000, izin tanpa surat 210.000; telat 16 → 2 blok, 45 → 3 blok = 50.000
    expect(result.attendance?.lines.map((line) => [line.kind, line.amount])).toEqual([
      ["absence", "210000.00"],
      ["permit_sick", "210000.00"],
      ["late", "50000.00"],
    ]);
    expect(result.attendanceDeductionTotal).toBe("470000.00");
    // 4.400.000 + 220.000 + 500.000 − 470.000
    expect(result.grossPay).toBe("4650000.00");
  });

  it("potongan absensi mengurangi bruto PPh 21 (pph21IncomeFromPayroll)", () => {
    const full = calc([GAPOK, TUNJ], PRORATE_ACTUAL, facts(), BPJS);
    const absent = calc([GAPOK, TUNJ], PRORATE_ACTUAL, facts({ absentDays: 2 }), BPJS);
    // Bruto = pendapatan setelah potongan + premi Kesehatan pemberi kerja (4% × 4.620.000 = 184.800, sama di keduanya)
    expect(pph21IncomeFromPayroll(full).grossIncome).toBe("4804800.00");
    expect(pph21IncomeFromPayroll(absent).grossIncome).toBe("4404800.00");
    expect(pph21IncomeFromPayroll(absent).pensionContribution).toBe("92400.00");
  });

  it("potongan absensi melebihi pendapatan → peringatan bruto negatif", () => {
    const rules: AttendanceDeductionRules = { ...NO_ATTENDANCE_DEDUCTION_RULES, absence: { mode: "fixed_per_day", amountPerDay: "1000000" } };
    const result = calc([{ ...GAPOK, amount: "3000000" }], rules, facts({ absentDays: 5 }));
    expect(result.grossPay).toBe("-2000000.00");
    expect(result.warnings).toContain("Potongan absensi melebihi pendapatan — pendapatan bruto negatif");
  });
});

describe("prorata masa kerja", () => {
  it("masuk di tengah periode: gaji pokok & tunjangan tetap diprorata per komponen, tunjangan tidak tetap & kehadiran tidak", () => {
    const result = calc([GAPOK, TUNJ, INSENTIF, HADIR], NO_ATTENDANCE_DEDUCTION_RULES, facts({ employedWorkingDays: 10 }), BPJS);
    // 4.400.000 × 10 ÷ 22 = 2.000.000; 220.000 × 10 ÷ 22 = 100.000
    expect(result.proration).toEqual({
      periodWorkingDays: 22,
      employedWorkingDays: 10,
      steps: [
        "Masa kerja 10 dari 22 hari kerja periode ini → gaji pokok & tunjangan tetap diprorata",
        "Gaji pokok: Rp 4.400.000 × 10 ÷ 22 = Rp 2.000.000",
        "Tunjangan jabatan: Rp 220.000 × 10 ÷ 22 = Rp 100.000",
      ],
    });
    expect(result.earnings).toEqual([{ ...GAPOK, amount: "2000000.00" }, { ...TUNJ, amount: "100000.00" }, INSENTIF, HADIR]);
    expect(result).toMatchObject({
      baseSalary: "2000000.00",
      fixedAllowances: "100000.00",
      variableAllowances: "500000.00",
      attendanceAllowancePaid: "300000.00",
      grossPay: "2900000.00",
      // Upah BPJS tetap sebulan penuh
      bpjsWage: "4620000.00",
    });
    expect(result.steps).toContain("Upah dasar BPJS: gaji pokok + tunjangan tetap sebulan penuh = Rp 4.620.000");
  });

  it("dibulatkan ke rupiah penuh HALF_UP per komponen", () => {
    const result = calc([{ ...GAPOK, amount: "5000000" }, { ...TUNJ, amount: "333333" }], NO_ATTENDANCE_DEDUCTION_RULES, facts({ employedWorkingDays: 7 }));
    // 5.000.000 × 7 ÷ 22 = 1.590.909,09 → 1.590.909; 333.333 × 7 ÷ 22 = 106.060,5 → 106.061
    expect(result.baseSalary).toBe("1590909.00");
    expect(result.fixedAllowances).toBe("106061.00");
  });

  it("alpa dinilai dari gaji sebulan penuh dan tidak melebihi gaji prorata", () => {
    const actual = calc([GAPOK], PRORATE_ACTUAL, facts({ employedWorkingDays: 10, absentDays: 2 }));
    // 4.400.000 × 2 ÷ 22 = 400.000 → 2.000.000 − 400.000
    expect(actual.attendanceDeductionTotal).toBe("400000.00");
    expect(actual.grossPay).toBe("1600000.00");

    const fixedDivisor: AttendanceDeductionRules = { ...PRORATE_ACTUAL, absence: { mode: "prorate", base: "base_salary", divisor: { mode: "fixed", days: 20 } } };
    const allAbsent = calc([GAPOK], fixedDivisor, facts({ employedWorkingDays: 10, absentDays: 10 }));
    // 4.400.000 × 10 ÷ 20 = 2.200.000 > gaji prorata 2.000.000 → dibatasi
    expect(allAbsent.attendanceDeductionTotal).toBe("2000000.00");
    expect(allAbsent.grossPay).toBe("0.00");
  });

  it("bekerja sepanjang periode → tidak diprorata, komponen asli", () => {
    const result = calc([GAPOK, TUNJ], NO_ATTENDANCE_DEDUCTION_RULES);
    expect(result.proration).toBeNull();
    expect(result.earnings).toEqual([GAPOK, TUNJ]);
  });

  it("tidak ada hari kerja di periode → tidak diprorata + peringatan", () => {
    const result = calc([GAPOK], NO_ATTENDANCE_DEDUCTION_RULES, facts({ periodWorkingDays: 0, employedWorkingDays: 0 }));
    expect(result.proration).toBeNull();
    expect(result.baseSalary).toBe("4400000.00");
    expect(result.warnings).toContain("Tidak ada hari kerja di periode ini — gaji tidak diprorata");
  });

  it("masa kerja 0 hari kerja → gaji pokok 0 + peringatan", () => {
    const result = calc([GAPOK], NO_ATTENDANCE_DEDUCTION_RULES, facts({ employedWorkingDays: 0 }));
    expect(result.baseSalary).toBe("0.00");
    expect(result.warnings).toContain("Tidak ada hari kerja dalam masa kerja karyawan di periode ini — gaji pokok & tunjangan tetap menjadi 0");
  });
});

describe("input absensi tidak valid", () => {
  it("masa kerja melebihi hari kerja periode / bukan bilangan bulat", () => {
    expect(() => calc([GAPOK], NO_ATTENDANCE_DEDUCTION_RULES, facts({ employedWorkingDays: 23 }))).toThrow(/melebihi hari kerja periode/);
    expect(() => calc([GAPOK], NO_ATTENDANCE_DEDUCTION_RULES, facts({ employedWorkingDays: 1.5 }))).toThrow(PayrollInputError);
    expect(() => calc([GAPOK], NO_ATTENDANCE_DEDUCTION_RULES, facts({ periodWorkingDays: -1 }))).toThrow(PayrollInputError);
  });

  it("lebih dari satu tunjangan kehadiran", () => {
    expect(() => calc([GAPOK, HADIR, { ...HADIR, code: "HADIR2" }], null)).toThrow(/Paling banyak satu komponen tunjangan kehadiran/);
  });
});

// Semua kombinasi mode aturan (alpa × telat × izin/sakit × tunjangan kehadiran). Tiap baris hasil gabungan harus sama
// dengan aturan itu dihitung sendiri (fakta kecil — batas tidak tercapai), dan total payroll konsisten.
describe("tiap kombinasi aturan", () => {
  const ABSENCE: Record<(typeof ABSENCE_DEDUCTION_MODES)[number], AttendanceDeductionRules["absence"]> = {
    none: { mode: "none" },
    prorate: { mode: "prorate", base: "base_and_fixed_allowances", divisor: { mode: "fixed", days: 26 } },
    fixed_per_day: { mode: "fixed_per_day", amountPerDay: "150000" },
  };
  const LATE: Record<(typeof LATE_DEDUCTION_MODES)[number], AttendanceDeductionRules["late"]> = {
    none: { mode: "none" },
    per_occurrence: { mode: "per_occurrence", toleranceMinutes: 10, amountPerOccurrence: "20000", monthlyCap: "100000" },
    per_block: { mode: "per_block", toleranceMinutes: 0, blockMinutes: 30, amountPerBlock: "15000", monthlyCap: null },
  };
  const PERMIT_SICK: Record<(typeof PERMIT_SICK_DEDUCTION_MODES)[number], AttendanceDeductionRules["permitSick"]> = {
    none: { mode: "none" },
    without_document: { mode: "without_document" },
    after_days: { mode: "after_days", freeDays: 1 },
  };
  const ALLOWANCE: Record<(typeof ATTENDANCE_ALLOWANCE_MODES)[number], AttendanceDeductionRules["attendanceAllowance"]> = {
    none: { mode: "none" },
    forfeit: { mode: "forfeit", minAbsentDays: 2 },
    reduce_per_day: { mode: "reduce_per_day", amountPerDay: "40000" },
  };
  const FACTS = facts({ employedWorkingDays: 18, absentDays: 2, lateMinutes: [5, 12, 61], permitDays: 1, sickDays: 2, undocumentedPermitSickDays: 1 });
  const COMPONENTS = [GAPOK, TUNJ, INSENTIF, HADIR];
  const SALARY = { baseSalary: "4400000.00", fixedAllowances: "220000.00", attendanceAllowance: "300000.00" };

  const lineAlone = (rules: AttendanceDeductionRules, kind: string) =>
    calculateAttendanceDeduction({ rules, salary: SALARY, facts: FACTS }).lines.find((line) => line.kind === kind);

  const combos: [string, AttendanceDeductionRules][] = [];
  for (const absence of ABSENCE_DEDUCTION_MODES)
    for (const late of LATE_DEDUCTION_MODES)
      for (const permitSick of PERMIT_SICK_DEDUCTION_MODES)
        for (const allowance of ATTENDANCE_ALLOWANCE_MODES) {
          // Izin/sakit butuh aturan alpa (refine zod + CHECK DB)
          if (absence === "none" && permitSick !== "none") continue;
          combos.push([
            `${absence} · ${late} · ${permitSick} · ${allowance}`,
            { absence: ABSENCE[absence], late: LATE[late], permitSick: PERMIT_SICK[permitSick], attendanceAllowance: ALLOWANCE[allowance] },
          ]);
        }

  it("63 kombinasi valid", () => expect(combos).toHaveLength(63));

  it.each(combos)("%s", (_name, rules) => {
    const result = calculatePayroll({ components: COMPONENTS, bpjs: BPJS, bpjsRates: RATES, attendance: { rules, facts: FACTS } });
    const attendance = result.attendance;
    if (!attendance) throw new Error("hasil absensi kosong");

    const expected = [
      lineAlone({ ...NO_ATTENDANCE_DEDUCTION_RULES, absence: rules.absence }, "absence"),
      lineAlone({ ...NO_ATTENDANCE_DEDUCTION_RULES, absence: rules.absence, permitSick: rules.permitSick }, "permit_sick"),
      lineAlone({ ...NO_ATTENDANCE_DEDUCTION_RULES, late: rules.late }, "late"),
      lineAlone({ ...NO_ATTENDANCE_DEDUCTION_RULES, attendanceAllowance: rules.attendanceAllowance }, "attendance_allowance"),
    ].filter((line) => line !== undefined);
    expect(attendance.lines).toEqual(expected);

    // Rupiah bulat, tidak negatif
    for (const line of attendance.lines) expect(line.amount).toMatch(/^\d+\.00$/);
    const deductionLines = attendance.lines.filter((line) => line.kind !== "attendance_allowance");
    const deductionSum = deductionLines.reduce((total, line) => total + Number(line.amount), 0);
    expect(Number(result.attendanceDeductionTotal)).toBe(deductionSum);
    const allowanceReduction = Number(attendance.lines.find((line) => line.kind === "attendance_allowance")?.amount ?? "0");
    expect(Number(result.attendanceAllowancePaid)).toBe(300000 - allowanceReduction);

    // Prorata 18/22: 3.600.000 + 180.000; bruto = + insentif + tunjangan kehadiran dibayar − potongan
    expect(result.baseSalary).toBe("3600000.00");
    expect(result.fixedAllowances).toBe("180000.00");
    expect(Number(result.grossPay)).toBe(3600000 + 180000 + 500000 + Number(result.attendanceAllowancePaid) - deductionSum);
    expect(Number(result.netPay)).toBe(Number(result.grossPay) - Number(result.totalDeductions));
    // BPJS tidak terpengaruh absensi
    expect(result.bpjsWage).toBe("4620000.00");
  });
});
