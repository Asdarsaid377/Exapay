import type { BpjsProgram, BpjsRate, JkkRiskLevel, PayrollComponentLine } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { calculatePayroll, type PayrollBpjsSettings, PayrollInputError } from "../src/payroll-calculation.js";

// Tarif = seed feature 24 yang berlaku 2026-10-01 (engine tidak membaca DB; tarif selalu input)
function rate(program: BpjsProgram, employer: string, employee: string, wageCap: string | null, jkkRiskLevel: JkkRiskLevel | null = null): BpjsRate {
  return {
    program,
    jkkRiskLevel,
    employerRatePercent: employer,
    employeeRatePercent: employee,
    wageCap,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    source: "test",
  };
}

const RATES_2026: BpjsRate[] = [
  rate("kesehatan", "4.0000", "1.0000", "12000000.00"),
  rate("jht", "3.7000", "2.0000", null),
  rate("jp", "2.0000", "1.0000", "11086300.00"),
  rate("jkk", "0.2400", "0.0000", null, 1),
  rate("jkk", "0.5400", "0.0000", null, 2),
  rate("jkk", "0.8900", "0.0000", null, 3),
  rate("jkk", "1.2700", "0.0000", null, 4),
  rate("jkk", "1.7400", "0.0000", null, 5),
  rate("jkm", "0.3000", "0.0000", null),
];

const ALL: PayrollBpjsSettings = { programs: ["kesehatan", "jht", "jp", "jkk", "jkm"], jkkRiskLevel: 1, minimumWage: "3921088.00" };

function base(amount: string): PayrollComponentLine {
  return { code: "GAPOK", name: "Gaji pokok", kind: "base_salary", amount };
}
function fixed(amount: string, code = "TUNJ_JABATAN"): PayrollComponentLine {
  return { code, name: "Tunjangan jabatan", kind: "fixed_allowance", amount };
}
function variable(amount: string, code = "INSENTIF"): PayrollComponentLine {
  return { code, name: "Insentif", kind: "variable_allowance", amount };
}
function deduction(amount: string, code = "KASBON"): PayrollComponentLine {
  return { code, name: "Kasbon", kind: "deduction", amount };
}

function calc(components: PayrollComponentLine[], bpjs: Partial<PayrollBpjsSettings> = {}, rates: BpjsRate[] = RATES_2026) {
  return calculatePayroll({ components, bpjs: { ...ALL, ...bpjs }, bpjsRates: rates });
}

function lineOf(result: ReturnType<typeof calculatePayroll>, program: BpjsProgram) {
  const line = result.bpjs.find((item) => item.program === program);
  if (!line) throw new Error(`iuran ${program} tidak ada`);
  return line;
}

function amounts(result: ReturnType<typeof calculatePayroll>, program: BpjsProgram) {
  const line = lineOf(result, program);
  return [line.contributionBase, line.employerAmount, line.employeeAmount];
}

describe("komponen & total", () => {
  it("kasus umum: pendapatan, iuran semua program, potongan, gaji bersih", () => {
    const result = calc([base("5000000"), fixed("500000"), variable("1000000"), deduction("200000")]);
    expect(result).toMatchObject({
      baseSalary: "5000000.00",
      fixedAllowances: "500000.00",
      variableAllowances: "1000000.00",
      grossPay: "6500000.00",
      bpjsWage: "5500000.00",
      // 220.000 + 203.500 + 110.000 + 13.200 + 16.500
      bpjsEmployerTotal: "563200.00",
      // 55.000 + 110.000 + 55.000
      bpjsEmployeeTotal: "220000.00",
      otherDeductionsTotal: "200000.00",
      totalDeductions: "420000.00",
      netPay: "6080000.00",
      warnings: [],
    });
    expect(result.bpjs.map((line) => line.program)).toEqual(["kesehatan", "jht", "jp", "jkk", "jkm"]);
    expect(amounts(result, "kesehatan")).toEqual(["5500000.00", "220000.00", "55000.00"]);
    expect(amounts(result, "jht")).toEqual(["5500000.00", "203500.00", "110000.00"]);
    expect(amounts(result, "jp")).toEqual(["5500000.00", "110000.00", "55000.00"]);
    expect(amounts(result, "jkk")).toEqual(["5500000.00", "13200.00", "0.00"]);
    expect(amounts(result, "jkm")).toEqual(["5500000.00", "16500.00", "0.00"]);
  });

  it("earnings & deductions mempertahankan komponen asli dan urutannya", () => {
    const components = [base("5000000"), deduction("100000"), fixed("250000", "TUNJ_MAKAN"), variable("75000.50")];
    const result = calc(components);
    expect(result.earnings).toEqual([components[0], components[2], components[3]]);
    expect(result.deductions).toEqual([components[1]]);
    expect(result.grossPay).toBe("5325000.50");
  });

  it("beberapa tunjangan tetap dijumlah ke upah dasar BPJS", () => {
    const result = calc([base("4000000"), fixed("300000", "A"), fixed("200000", "B")]);
    expect(result.bpjsWage).toBe("4500000.00");
    expect(lineOf(result, "jht").contributionBase).toBe("4500000.00");
  });

  it("tunjangan tidak tetap (mis. THR) tidak ikut dasar iuran", () => {
    const result = calc([base("10000000"), variable("10000000", "THR")]);
    expect(result.grossPay).toBe("20000000.00");
    expect(result.bpjsWage).toBe("10000000.00");
    expect(amounts(result, "kesehatan")).toEqual(["10000000.00", "400000.00", "100000.00"]);
  });

  it("langkah perhitungan bisa dibaca", () => {
    const result = calc([base("5000000"), fixed("500000"), variable("1000000"), deduction("200000")]);
    expect(result.steps).toEqual([
      "Pendapatan: gaji pokok Rp 5.000.000 + tunjangan tetap Rp 500.000 + tunjangan tidak tetap Rp 1.000.000 = Rp 6.500.000",
      "Upah dasar BPJS: gaji pokok + tunjangan tetap = Rp 5.500.000",
      "Iuran BPJS: perusahaan Rp 563.200, karyawan Rp 220.000",
      "Potongan: iuran BPJS karyawan Rp 220.000 + potongan lain Rp 200.000 = Rp 420.000",
      "Gaji bersih sebelum PPh 21: Rp 6.500.000 − Rp 420.000 = Rp 6.080.000",
    ]);
    expect(lineOf(result, "jht").steps).toEqual([
      "Dasar iuran Rp 5.500.000",
      "Perusahaan 3,7% × Rp 5.500.000 = Rp 203.500",
      "Karyawan 2% × Rp 5.500.000 = Rp 110.000",
    ]);
    expect(lineOf(result, "jkk").steps).toContain("Karyawan: tidak ada iuran (ditanggung perusahaan)");
    expect(lineOf(result, "jkk").steps).toContain("Perusahaan 0,24% × Rp 5.500.000 = Rp 13.200");
  });
});

describe("batas atas upah", () => {
  it("di atas batas: Kesehatan Rp12 jt & JP Rp11.086.300 dibatasi, JHT/JKK/JKM tidak", () => {
    const result = calc([base("15000000")]);
    expect(amounts(result, "kesehatan")).toEqual(["12000000.00", "480000.00", "120000.00"]);
    expect(amounts(result, "jp")).toEqual(["11086300.00", "221726.00", "110863.00"]);
    expect(amounts(result, "jht")).toEqual(["15000000.00", "555000.00", "300000.00"]);
    expect(amounts(result, "jkk")).toEqual(["15000000.00", "36000.00", "0.00"]);
    expect(amounts(result, "jkm")).toEqual(["15000000.00", "45000.00", "0.00"]);
    expect(lineOf(result, "kesehatan").steps[0]).toBe("Upah Rp 15.000.000 melebihi batas Rp 12.000.000 → dasar iuran dibatasi");
  });

  it("tepat di batas tidak dianggap melebihi", () => {
    const result = calc([base("12000000")]);
    expect(amounts(result, "kesehatan")).toEqual(["12000000.00", "480000.00", "120000.00"]);
    expect(lineOf(result, "kesehatan").steps[0]).toBe("Dasar iuran Rp 12.000.000");
  });

  it("satu rupiah di bawah / di atas batas JP", () => {
    expect(lineOf(calc([base("11086299")]), "jp").contributionBase).toBe("11086299.00");
    expect(lineOf(calc([base("11086300")]), "jp").contributionBase).toBe("11086300.00");
    expect(lineOf(calc([base("11086301")]), "jp").contributionBase).toBe("11086300.00");
  });

  it("batas mengikuti versi tarif yang diberikan (JP 2025: Rp10.547.400)", () => {
    const rates2025 = RATES_2026.map((r) => (r.program === "jp" ? { ...r, wageCap: "10547400.00" } : r));
    expect(amounts(calc([base("15000000")], {}, rates2025), "jp")).toEqual(["10547400.00", "210948.00", "105474.00"]);
  });

  it("gaji pokok + tunjangan tetap bersama-sama melewati batas", () => {
    const result = calc([base("11000000"), fixed("2000000")]);
    expect(lineOf(result, "kesehatan").contributionBase).toBe("12000000.00");
    expect(lineOf(result, "jht").contributionBase).toBe("13000000.00");
  });
});

describe("batas bawah BPJS Kesehatan (upah minimum)", () => {
  it("upah di bawah UMK/UMP → dasar iuran Kesehatan = upah minimum; program lain tetap upah aktual", () => {
    const result = calc([base("3000000")]);
    // 3.921.088 × 4% = 156.843,52 → 156.844; × 1% = 39.210,88 → 39.211
    expect(amounts(result, "kesehatan")).toEqual(["3921088.00", "156844.00", "39211.00"]);
    expect(lineOf(result, "kesehatan").steps[0]).toBe(
      "Upah Rp 3.000.000 di bawah upah minimum Rp 3.921.088 → dasar iuran memakai upah minimum",
    );
    expect(amounts(result, "jht")).toEqual(["3000000.00", "111000.00", "60000.00"]);
  });

  it("upah sama dengan / di atas upah minimum → upah aktual", () => {
    expect(lineOf(calc([base("3921088")]), "kesehatan").steps[0]).toBe("Dasar iuran Rp 3.921.088");
    expect(lineOf(calc([base("3500000"), fixed("500000")]), "kesehatan").contributionBase).toBe("4000000.00");
  });

  it("data upah minimum tidak ada → upah aktual + peringatan", () => {
    const result = calc([base("3000000")], { minimumWage: null });
    expect(lineOf(result, "kesehatan").contributionBase).toBe("3000000.00");
    expect(result.warnings).toEqual([
      "Data upah minimum lokasi usaha tidak tersedia — batas bawah dasar iuran BPJS Kesehatan tidak diterapkan",
    ]);
  });

  it("tanpa Kesehatan → tidak ada peringatan upah minimum", () => {
    expect(calc([base("3000000")], { programs: ["jht"], minimumWage: null }).warnings).toEqual([]);
  });
});

describe("pembulatan rupiah HALF_UP per iuran", () => {
  it(",5 ke atas; < ,5 ke bawah", () => {
    // JKM 0,3% × 1.000.500 = 3.001,5 → 3.002
    expect(lineOf(calc([base("1000500")], { minimumWage: "0.01" }), "jkm").employerAmount).toBe("3002.00");
    // 0,3% × 1.000.450 = 3.001,35 → 3.001
    expect(lineOf(calc([base("1000450")], { minimumWage: "0.01" }), "jkm").employerAmount).toBe("3001.00");
    // 1% × 1.000.050 = 10.000,5 → 10.001
    expect(lineOf(calc([base("1000050")], { minimumWage: "0.01" }), "kesehatan").employeeAmount).toBe("10001.00");
  });

  it("upah bersen dibulatkan di iuran, bukan di upah dasar", () => {
    const result = calc([base("5000000.50")]);
    expect(result.bpjsWage).toBe("5000000.50");
    // 3,7% × 5.000.000,50 = 185.000,0185 → 185.000; 2% → 100.000,01 → 100.000
    expect(amounts(result, "jht")).toEqual(["5000000.50", "185000.00", "100000.00"]);
  });

  it("total = jumlah iuran yang sudah dibulatkan", () => {
    const result = calc([base("3333333")]);
    const employer = result.bpjs.reduce((total, line) => total + Number(line.employerAmount), 0);
    const employee = result.bpjs.reduce((total, line) => total + Number(line.employeeAmount), 0);
    expect(Number(result.bpjsEmployerTotal)).toBe(employer);
    expect(Number(result.bpjsEmployeeTotal)).toBe(employee);
  });
});

describe("kepesertaan & kelompok risiko", () => {
  it("tidak ikut JP (mis. usia pensiun) → tanpa baris JP", () => {
    const result = calc([base("5000000")], { programs: ["kesehatan", "jht", "jkk", "jkm"] });
    expect(result.bpjs.map((line) => line.program)).toEqual(["kesehatan", "jht", "jkk", "jkm"]);
    expect(result.bpjsEmployeeTotal).toBe("150000.00");
  });

  it("tanpa program BPJS sama sekali", () => {
    const result = calc([base("5000000"), deduction("100000")], { programs: [], jkkRiskLevel: null });
    expect(result.bpjs).toEqual([]);
    expect(result.bpjsEmployerTotal).toBe("0.00");
    expect(result.netPay).toBe("4900000.00");
    expect(result.steps).toContain("Tidak terdaftar program BPJS");
  });

  it("JKK memakai tarif kelompok risiko usaha", () => {
    const result = calc([base("5000000")], { jkkRiskLevel: 5 });
    // 1,74% × 5.000.000
    expect(lineOf(result, "jkk")).toMatchObject({ jkkRiskLevel: 5, employerRatePercent: "1.7400", employerAmount: "87000.00" });
    expect(lineOf(result, "kesehatan").jkkRiskLevel).toBeNull();
  });

  it("program duplikat di input dihitung sekali", () => {
    expect(calc([base("5000000")], { programs: ["jht", "jht"] }).bpjs).toHaveLength(1);
  });
});

describe("gaji bersih", () => {
  it("potongan melebihi pendapatan → negatif + peringatan", () => {
    const result = calc([base("1000000"), deduction("2000000")], { programs: [], jkkRiskLevel: null });
    expect(result.netPay).toBe("-1000000.00");
    expect(result.warnings).toContain("Potongan melebihi pendapatan — gaji bersih negatif");
  });

  it("gaji pokok 0 tetap terhitung tanpa error", () => {
    const result = calc([base("0")], { programs: ["jht"] });
    expect(result.netPay).toBe("0.00");
    expect(amounts(result, "jht")).toEqual(["0.00", "0.00", "0.00"]);
  });
});

describe("input tidak valid", () => {
  it("tanpa / lebih dari satu gaji pokok", () => {
    expect(() => calc([fixed("100000")])).toThrow(PayrollInputError);
    expect(() => calc([base("1"), base("2")])).toThrow(/tepat satu komponen gaji pokok \(ditemukan 2\)/);
  });

  it("nominal negatif atau bukan angka", () => {
    expect(() => calc([base("5000000"), deduction("-1")])).toThrow(/KASBON harus ≥ 0/);
    expect(() => calc([base("lima juta")])).toThrow(/GAPOK tidak valid/);
  });

  it("ikut JKK tanpa kelompok risiko", () => {
    expect(() => calc([base("5000000")], { jkkRiskLevel: null })).toThrow(/Kelompok risiko JKK wajib/);
  });

  it("tarif program yang diikuti tidak tersedia", () => {
    const withoutJp = RATES_2026.filter((r) => r.program !== "jp");
    expect(() => calc([base("5000000")], {}, withoutJp)).toThrow(/Tarif JP tidak tersedia/);
    const withoutJkk3 = RATES_2026.filter((r) => r.jkkRiskLevel !== 3);
    expect(() => calc([base("5000000")], { jkkRiskLevel: 3 }, withoutJkk3)).toThrow(/Tarif JKK risiko 3 tidak tersedia/);
  });
});
