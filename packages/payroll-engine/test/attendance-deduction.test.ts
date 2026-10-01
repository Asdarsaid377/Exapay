import {
  type AttendanceDeductionFacts,
  type AttendanceDeductionRules,
  attendanceDeductionRulesSchema,
  formatRupiah,
  NO_ATTENDANCE_DEDUCTION_RULES,
} from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { type AttendanceDeductionSalary, calculateAttendanceDeduction } from "../src/attendance-deduction.js";

const SALARY: AttendanceDeductionSalary = { baseSalary: "5000000", fixedAllowances: "1000000", attendanceAllowance: "300000" };

function facts(overrides: Partial<AttendanceDeductionFacts> = {}): AttendanceDeductionFacts {
  return { periodWorkingDays: 22, employedWorkingDays: 22, absentDays: 0, lateMinutes: [], permitDays: 0, sickDays: 0, undocumentedPermitSickDays: 0, ...overrides };
}

function rules(overrides: Partial<AttendanceDeductionRules>): AttendanceDeductionRules {
  return { ...NO_ATTENDANCE_DEDUCTION_RULES, ...overrides };
}

function lineOf(result: ReturnType<typeof calculateAttendanceDeduction>, kind: string) {
  const line = result.lines.find((item) => item.kind === kind);
  if (!line) throw new Error(`baris ${kind} tidak ada`);
  return line;
}

describe("calculateAttendanceDeduction — tanpa aturan", () => {
  it("tidak ada baris, potongan 0, tunjangan kehadiran dibayar penuh", () => {
    const result = calculateAttendanceDeduction({
      rules: NO_ATTENDANCE_DEDUCTION_RULES,
      salary: SALARY,
      facts: facts({ absentDays: 3, lateMinutes: [30], permitDays: 2 }),
    });
    expect(result).toEqual({ lines: [], totalDeduction: "0.00", attendanceAllowancePaid: "300000.00" });
  });
});

describe("alpa — prorata", () => {
  const prorate = (base: "base_salary" | "base_and_fixed_allowances", divisor: { mode: "actual" } | { mode: "fixed"; days: number }) =>
    rules({ absence: { mode: "prorate", base, divisor } });

  it("gaji pokok ÷ hari kerja aktual × hari alpa, dibulatkan ke rupiah", () => {
    const result = calculateAttendanceDeduction({ rules: prorate("base_salary", { mode: "actual" }), salary: SALARY, facts: facts({ absentDays: 3 }) });
    // 5.000.000 × 3 ÷ 22 = 681.818,18
    expect(lineOf(result, "absence").amount).toBe("681818.00");
    expect(result.totalDeduction).toBe("681818.00");
    expect(lineOf(result, "absence").steps).toContain("Alpa: Rp 5.000.000 × 3 hari ÷ 22 = Rp 681.818");
  });

  it("gaji pokok + tunjangan tetap dengan pembagi tetap", () => {
    const result = calculateAttendanceDeduction({
      rules: prorate("base_and_fixed_allowances", { mode: "fixed", days: 25 }),
      salary: SALARY,
      facts: facts({ absentDays: 2, periodWorkingDays: 21, employedWorkingDays: 21 }),
    });
    // 6.000.000 × 2 ÷ 25
    expect(lineOf(result, "absence").amount).toBe("480000.00");
    expect(lineOf(result, "absence").steps[0]).toBe("Dasar prorata: gaji pokok Rp 5.000.000 + tunjangan tetap Rp 1.000.000 = Rp 6.000.000");
    expect(lineOf(result, "absence").steps[1]).toBe("Pembagi: 25 hari (angka tetap)");
  });

  it("pembulatan HALF_UP: ,5 ke atas", () => {
    const result = calculateAttendanceDeduction({
      rules: prorate("base_salary", { mode: "fixed", days: 2 }),
      salary: { ...SALARY, baseSalary: "1001" },
      facts: facts({ absentDays: 1 }),
    });
    expect(lineOf(result, "absence").amount).toBe("501.00");
  });

  it("tanpa hari alpa → baris tetap ada dengan nilai 0", () => {
    const result = calculateAttendanceDeduction({ rules: prorate("base_salary", { mode: "actual" }), salary: SALARY, facts: facts() });
    expect(lineOf(result, "absence")).toMatchObject({ amount: "0.00" });
    expect(lineOf(result, "absence").steps).toContain("Tidak ada hari alpa");
  });

  it("pembagi aktual 0 (tanpa hari kerja) → tidak dipotong, tanpa bagi nol", () => {
    const result = calculateAttendanceDeduction({
      rules: prorate("base_salary", { mode: "actual" }),
      salary: SALARY,
      facts: facts({ periodWorkingDays: 0, absentDays: 1 }),
    });
    expect(lineOf(result, "absence").amount).toBe("0.00");
  });

  it("potongan tidak melebihi dasar prorata", () => {
    const result = calculateAttendanceDeduction({
      rules: prorate("base_salary", { mode: "fixed", days: 20 }),
      salary: SALARY,
      facts: facts({ absentDays: 23, periodWorkingDays: 23, employedWorkingDays: 23 }),
    });
    expect(lineOf(result, "absence").amount).toBe("5000000.00");
    expect(lineOf(result, "absence").steps).toContain("Dibatasi sebesar dasar prorata Rp 5.000.000");
  });
});

describe("alpa — nominal tetap per hari", () => {
  it("hari alpa × nominal", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: { mode: "fixed_per_day", amountPerDay: "50000" } }),
      salary: SALARY,
      facts: facts({ absentDays: 3 }),
    });
    expect(lineOf(result, "absence").amount).toBe("150000.00");
    expect(lineOf(result, "absence").steps).toContain("Alpa: 3 hari × Rp 50.000 = Rp 150.000");
  });

  it("nominal bersen dibulatkan HALF_UP", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: { mode: "fixed_per_day", amountPerDay: "33333.50" } }),
      salary: SALARY,
      facts: facts({ absentDays: 1 }),
    });
    expect(lineOf(result, "absence").amount).toBe("33334.00");
  });

  it("tanpa batas atas (tidak dibatasi gaji)", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: { mode: "fixed_per_day", amountPerDay: "400000" } }),
      salary: SALARY,
      facts: facts({ absentDays: 20 }),
    });
    expect(lineOf(result, "absence").amount).toBe("8000000.00");
  });
});

describe("izin/sakit", () => {
  const fixedAbsence = { mode: "fixed_per_day", amountPerDay: "100000" } as const;

  it("tanpa surat: hanya hari tanpa lampiran, dinilai sama dengan hari alpa", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: fixedAbsence, permitSick: { mode: "without_document" } }),
      salary: SALARY,
      facts: facts({ permitDays: 2, sickDays: 1, undocumentedPermitSickDays: 2 }),
    });
    expect(lineOf(result, "permit_sick")).toEqual({
      kind: "permit_sick",
      amount: "200000.00",
      steps: ["Izin/sakit tanpa surat: 2 dari 3 hari", "2 hari × Rp 100.000 = Rp 200.000"],
    });
    expect(result.totalDeduction).toBe("200000.00");
  });

  it("setelah N hari: izin + sakit digabung, sisa di atas N yang dipotong", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: fixedAbsence, permitSick: { mode: "after_days", freeDays: 3 } }),
      salary: SALARY,
      facts: facts({ permitDays: 2, sickDays: 3 }),
    });
    expect(lineOf(result, "permit_sick").amount).toBe("200000.00");
  });

  it("setelah N hari: di bawah N tidak dipotong", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: fixedAbsence, permitSick: { mode: "after_days", freeDays: 3 } }),
      salary: SALARY,
      facts: facts({ permitDays: 1, sickDays: 1 }),
    });
    expect(lineOf(result, "permit_sick").amount).toBe("0.00");
  });

  it("prorata: alpa + izin/sakit bersama tidak melebihi dasar prorata", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({
        absence: { mode: "prorate", base: "base_salary", divisor: { mode: "fixed", days: 10 } },
        permitSick: { mode: "after_days", freeDays: 0 },
      }),
      salary: SALARY,
      facts: facts({ absentDays: 8, sickDays: 5 }),
    });
    expect(lineOf(result, "absence").amount).toBe("4000000.00");
    expect(lineOf(result, "permit_sick").amount).toBe("1000000.00");
    expect(lineOf(result, "permit_sick").steps).toContain("Dibatasi sisa dasar prorata Rp 1.000.000");
    expect(result.totalDeduction).toBe("5000000.00");
  });

  it("skema menolak potongan izin/sakit tanpa aturan alpa", () => {
    const parsed = attendanceDeductionRulesSchema.safeParse(rules({ permitSick: { mode: "without_document" } }));
    expect(parsed.success).toBe(false);
  });
});

describe("telat", () => {
  it("per kejadian dengan toleransi: telat ≤ toleransi diabaikan", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ late: { mode: "per_occurrence", toleranceMinutes: 15, amountPerOccurrence: "25000", monthlyCap: null } }),
      salary: SALARY,
      facts: facts({ lateMinutes: [5, 15, 16, 60] }),
    });
    expect(lineOf(result, "late")).toEqual({
      kind: "late",
      amount: "50000.00",
      steps: ["Toleransi 15 menit: 2 dari 4 kali telat dihitung", "2 kali × Rp 25.000 = Rp 50.000"],
    });
  });

  it("per blok menit: seluruh menit telat, dibulatkan ke atas per kejadian", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ late: { mode: "per_block", toleranceMinutes: 10, blockMinutes: 30, amountPerBlock: "10000", monthlyCap: null } }),
      salary: SALARY,
      facts: facts({ lateMinutes: [5, 11, 30, 31, 90] }),
    });
    // 11→1, 30→1, 31→2, 90→3 = 7 blok
    expect(lineOf(result, "late").amount).toBe("70000.00");
    expect(lineOf(result, "late").steps).toContain("162 menit telat = 7 blok 30 menit (tiap kejadian dibulatkan ke atas)");
  });

  it("batas maksimal per bulan", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ late: { mode: "per_block", toleranceMinutes: 10, blockMinutes: 30, amountPerBlock: "10000", monthlyCap: "50000" } }),
      salary: SALARY,
      facts: facts({ lateMinutes: [5, 11, 30, 31, 90] }),
    });
    expect(lineOf(result, "late").amount).toBe("50000.00");
    expect(lineOf(result, "late").steps).toContain("Dibatasi batas per bulan Rp 50.000");
  });

  it("tanpa toleransi: semua kejadian telat dihitung", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ late: { mode: "per_occurrence", toleranceMinutes: 0, amountPerOccurrence: "10000", monthlyCap: null } }),
      salary: SALARY,
      facts: facts({ lateMinutes: [1, 2] }),
    });
    expect(lineOf(result, "late").amount).toBe("20000.00");
  });

  it("tanpa telat di atas toleransi → 0", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ late: { mode: "per_occurrence", toleranceMinutes: 15, amountPerOccurrence: "25000", monthlyCap: "100000" } }),
      salary: SALARY,
      facts: facts({ lateMinutes: [3] }),
    });
    expect(lineOf(result, "late").amount).toBe("0.00");
  });
});

describe("tunjangan kehadiran", () => {
  it("hangus jika alpa ≥ N", () => {
    const rule = rules({ attendanceAllowance: { mode: "forfeit", minAbsentDays: 2 } });
    const kept = calculateAttendanceDeduction({ rules: rule, salary: SALARY, facts: facts({ absentDays: 1 }) });
    expect(kept.attendanceAllowancePaid).toBe("300000.00");
    expect(lineOf(kept, "attendance_allowance").amount).toBe("0.00");

    const forfeited = calculateAttendanceDeduction({ rules: rule, salary: SALARY, facts: facts({ absentDays: 2 }) });
    expect(forfeited.attendanceAllowancePaid).toBe("0.00");
    expect(lineOf(forfeited, "attendance_allowance").amount).toBe("300000.00");
  });

  it("berkurang per hari alpa, maksimal sebesar tunjangan", () => {
    const rule = rules({ attendanceAllowance: { mode: "reduce_per_day", amountPerDay: "50000" } });
    const reduced = calculateAttendanceDeduction({ rules: rule, salary: SALARY, facts: facts({ absentDays: 2 }) });
    expect(reduced.attendanceAllowancePaid).toBe("200000.00");

    const capped = calculateAttendanceDeduction({ rules: rule, salary: SALARY, facts: facts({ absentDays: 10 }) });
    expect(capped.attendanceAllowancePaid).toBe("0.00");
    expect(lineOf(capped, "attendance_allowance").steps).toContain("Dibatasi sebesar tunjangan Rp 300.000");
  });

  it("pengurangan tunjangan tidak masuk total potongan", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: { mode: "fixed_per_day", amountPerDay: "100000" }, attendanceAllowance: { mode: "forfeit", minAbsentDays: 1 } }),
      salary: SALARY,
      facts: facts({ absentDays: 1 }),
    });
    expect(result.totalDeduction).toBe("100000.00");
    expect(result.lines.map((line) => line.kind)).toEqual(["absence", "attendance_allowance"]);
  });
});

describe("masa kerja sebagian periode", () => {
  const prorate = (divisor: { mode: "actual" } | { mode: "fixed"; days: number }) =>
    rules({ absence: { mode: "prorate", base: "base_salary", divisor }, permitSick: { mode: "without_document" } });

  it("alpa + izin/sakit dibatasi dasar prorata × masa kerja ÷ hari kerja periode", () => {
    // Pembagi tetap 20 < 22 hari kerja periode; masa kerja 10 hari, alpa 8 + sakit tanpa surat 2 = seluruh masa kerja
    const result = calculateAttendanceDeduction({
      rules: prorate({ mode: "fixed", days: 20 }),
      salary: SALARY,
      facts: facts({ employedWorkingDays: 10, absentDays: 8, sickDays: 2, undocumentedPermitSickDays: 2 }),
    });
    // Batas 5.000.000 × 10 ÷ 22 = 2.272.727,27; alpa 5.000.000 × 8 ÷ 20 = 2.000.000; izin/sakit 500.000 → sisa 272.727,27
    expect(lineOf(result, "absence").amount).toBe("2000000.00");
    expect(lineOf(result, "absence").steps).toContain("Masa kerja 10 dari 22 hari kerja → batas potongan Rp 2.272.727");
    expect(lineOf(result, "permit_sick").amount).toBe("272727.00");
    expect(lineOf(result, "permit_sick").steps).toContain("Dibatasi sisa dasar prorata Rp 272.727,27");
    expect(result.totalDeduction).toBe("2272727.00");
  });

  it("pembagi aktual: alpa sepanjang masa kerja = gaji prorata, tidak kena batas", () => {
    const result = calculateAttendanceDeduction({ rules: prorate({ mode: "actual" }), salary: SALARY, facts: facts({ employedWorkingDays: 10, absentDays: 10 }) });
    // 5.000.000 × 10 ÷ 22 = 2.272.727,27
    expect(lineOf(result, "absence").amount).toBe("2272727.00");
    expect(lineOf(result, "absence").steps.some((step) => step.startsWith("Dibatasi"))).toBe(false);
  });

  it("nominal tetap per hari tidak dibatasi", () => {
    const result = calculateAttendanceDeduction({
      rules: rules({ absence: { mode: "fixed_per_day", amountPerDay: "300000" } }),
      salary: SALARY,
      facts: facts({ employedWorkingDays: 5, absentDays: 5 }),
    });
    expect(lineOf(result, "absence").amount).toBe("1500000.00");
  });
});

describe("gabungan", () => {
  it("urutan baris tetap dan total = alpa + izin/sakit + telat", () => {
    const result = calculateAttendanceDeduction({
      rules: {
        absence: { mode: "prorate", base: "base_salary", divisor: { mode: "actual" } },
        permitSick: { mode: "without_document" },
        late: { mode: "per_occurrence", toleranceMinutes: 0, amountPerOccurrence: "20000", monthlyCap: null },
        attendanceAllowance: { mode: "reduce_per_day", amountPerDay: "25000" },
      },
      salary: SALARY,
      facts: facts({ periodWorkingDays: 20, employedWorkingDays: 20, absentDays: 1, undocumentedPermitSickDays: 1, sickDays: 1, lateMinutes: [10, 20] }),
    });
    expect(result.lines.map((line) => line.kind)).toEqual(["absence", "permit_sick", "late", "attendance_allowance"]);
    // 250.000 + 250.000 + 40.000
    expect(result.totalDeduction).toBe("540000.00");
    expect(result.attendanceAllowancePaid).toBe("275000.00");
  });
});

describe("formatRupiah", () => {
  it("pemisah ribuan titik, sen koma, ,00 dihilangkan", () => {
    expect(formatRupiah("5000000.00")).toBe("Rp 5.000.000");
    expect(formatRupiah("681818.18")).toBe("Rp 681.818,18");
    expect(formatRupiah("0")).toBe("Rp 0");
    expect(formatRupiah("999")).toBe("Rp 999");
    expect(formatRupiah("1000.5")).toBe("Rp 1.000,50");
    expect(formatRupiah("-25000")).toBe("-Rp 25.000");
  });
});
