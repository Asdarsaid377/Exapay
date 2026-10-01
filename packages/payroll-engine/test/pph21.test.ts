import { readFileSync } from "node:fs";

import type { PayrollRegulations, Pph21PeriodRecord, PtkpRate, PtkpStatus, TaxBracket, TaxRateKind, TerKind } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { calculatePayroll, PayrollInputError } from "../src/payroll-calculation.js";
import { calculatePph21, type Pph21Input, pph21IncomeFromPayroll } from "../src/pph21.js";

// Tarif pajak & PTKP dibaca dari seed migration feature 24 — contoh DJP di bawah sekaligus memverifikasi data seed.
const SEED = readFileSync(new URL("../../db/migrations/0022_seed_regulations.sql", import.meta.url), "utf8");

function seedBrackets(kind: TaxRateKind): TaxBracket[] {
  const pattern = new RegExp(`\\('${kind}', '2024-01-01', (\\d+), (NULL|[0-9.]+), ([0-9.]+)\\)`, "g");
  return [...SEED.matchAll(pattern)]
    .map((m) => ({ seq: Number(m[1]), incomeUpTo: m[2] === "NULL" ? null : (m[2] ?? null), ratePercent: m[3] ?? "" }))
    .sort((a, b) => a.seq - b.seq)
    .map(({ incomeUpTo, ratePercent }) => ({ incomeUpTo, ratePercent }));
}

function seedPtkp(): PtkpRate[] {
  const pattern = /\('([TK]+\/[0-3])', ([0-9.]+), '(ter_[abc])', '2024-01-01', NULL,/g;
  return [...SEED.matchAll(pattern)].map((m) => ({
    status: m[1] as PtkpStatus, // diambil dari seed yang memakai daftar PTKP_STATUSES
    annualAmount: m[2] ?? "",
    terKind: m[3] as TerKind, // pola regex hanya menerima ter_a/b/c
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    source: "seed",
  }));
}

const version = { effectiveFrom: "2024-01-01", effectiveTo: null, source: "seed" };
const REGULATIONS: Pick<PayrollRegulations, "taxTables" | "ptkp" | "pph21"> = {
  taxTables: (["ter_a", "ter_b", "ter_c", "pasal_17"] as const).map((kind) => ({ kind, brackets: seedBrackets(kind), ...version })),
  ptkp: seedPtkp(),
  pph21: {
    occupationalCostRatePercent: "5.0000",
    occupationalCostMonthlyMax: "500000.00",
    occupationalCostAnnualMax: "6000000.00",
    ...version,
  },
};

function pph(overrides: Partial<Pph21Input> & { gross: string; pension?: string; religious?: string }) {
  const { gross, pension = "0", religious = "0", ...rest } = overrides;
  return calculatePph21({
    ptkpStatus: "TK/0",
    month: 1,
    endsEmployment: false,
    current: { grossIncome: gross, pensionContribution: pension, religiousContribution: religious },
    previousPeriods: [],
    previousEmployer: null,
    regulations: REGULATIONS,
    ...rest,
  });
}

function record(month: number, gross: string, withheld: string, pension = "0", religious = "0"): Pph21PeriodRecord {
  return { month, grossIncome: gross, pensionContribution: pension, religiousContribution: religious, pph21Withheld: withheld };
}

describe("data seed", () => {
  it("tabel TER A/B/C & Pasal 17 terbaca lengkap, lapis terakhir tanpa batas", () => {
    expect(seedBrackets("ter_a")).toHaveLength(44);
    expect(seedBrackets("ter_b")).toHaveLength(40);
    expect(seedBrackets("ter_c")).toHaveLength(41);
    expect(seedBrackets("pasal_17")).toHaveLength(5);
    for (const table of REGULATIONS.taxTables) expect(table.brackets.at(-1)?.incomeUpTo).toBeNull();
    expect(REGULATIONS.ptkp).toHaveLength(8);
  });
});

// Contoh resmi: lampiran PMK 168/2023 (materi sosialisasi DJP, pajak.go.id)
describe("contoh DJP — Tuan A, K/0, setahun penuh dengan THR & bonus", () => {
  const months: [number, string, string][] = [
    [1, "30080000", "3910400"],
    [2, "35080000", "4911200"],
    [3, "30080000", "3910400"],
    [4, "30080000", "3910400"],
    [5, "35080000", "4911200"],
    [6, "30080000", "3910400"],
    [7, "50080000", "9014400"],
    [8, "30080000", "3910400"],
    [9, "30080000", "3910400"],
    [10, "30080000", "3910400"],
    [11, "30080000", "3910400"],
  ];

  it("Januari–November: bruto × TER A (13% / 14% / 18%)", () => {
    for (const [month, gross, expected] of months) {
      const result = pph({ ptkpStatus: "K/0", month, gross, pension: "100000", religious: "200000" });
      expect(result.method).toBe("ter");
      expect(result.terKind).toBe("ter_a");
      expect(result.pph21).toBe(`${expected}.00`);
    }
  });

  it("Desember: PPh setahun Rp64.715.000 − Rp50.120.000 = Rp14.595.000", () => {
    const result = pph({
      ptkpStatus: "K/0",
      month: 12,
      gross: "90080000",
      pension: "100000",
      religious: "200000",
      previousPeriods: months.map(([month, gross, withheld]) => record(month, gross, withheld, "100000", "200000")),
    });
    expect(result.method).toBe("annual");
    expect(result.annual).toMatchObject({
      monthsWorked: 12,
      grossIncome: "450960000.00",
      occupationalCost: "6000000.00",
      pensionContribution: "1200000.00",
      religiousContribution: "2400000.00",
      netIncome: "441360000.00",
      ptkp: "58500000.00",
      taxableIncome: "382860000.00",
      annualTax: "64715000.00",
      withheldThisEmployer: "50120000.00",
    });
    expect(result.pph21).toBe("14595000.00");
    expect(result.warnings).toEqual([]);
  });
});

describe("contoh DJP — Tuan B, TK/0, mulai bekerja 1 September", () => {
  const previous = [9, 10, 11].map((month) => record(month, "15500000", "1085000", "100000"));

  it("September–November: 7% × Rp15.500.000 = Rp1.085.000", () => {
    expect(pph({ month: 9, gross: "15500000", pension: "100000" }).pph21).toBe("1085000.00");
  });

  it("Desember: biaya jabatan maks 4 × Rp500.000, PTKP penuh, lebih dipotong Rp2.975.000", () => {
    const result = pph({ month: 12, gross: "15500000", pension: "100000", previousPeriods: previous });
    expect(result.annual).toMatchObject({
      monthsWorked: 4,
      grossIncome: "62000000.00",
      occupationalCost: "2000000.00",
      pensionContribution: "400000.00",
      netIncome: "59600000.00",
      ptkp: "54000000.00",
      taxableIncome: "5600000.00",
      annualTax: "280000.00",
      withheldThisEmployer: "3255000.00",
    });
    expect(result.pph21).toBe("-2975000.00");
    expect(result.warnings).toContain("Kelebihan potong PPh 21 Rp 2.975.000 — dikembalikan ke pegawai");
    expect(result.warnings.some((w) => w.startsWith("Hanya 3 dari 11 masa"))).toBe(true);
  });
});

describe("contoh DJP — Tuan D, TK/0, pindah kerja 1 September", () => {
  it("PT W, berhenti Agustus: masa terakhir = Agustus, lebih dipotong Rp3.620.000", () => {
    const previous = [1, 2, 3, 4, 5, 6, 7].map((month) => record(month, "17500000", "1400000", "100000"));
    expect(pph({ month: 7, gross: "17500000" }).pph21).toBe("1400000.00");
    const result = pph({ month: 8, endsEmployment: true, gross: "17500000", pension: "100000", previousPeriods: previous });
    expect(result.method).toBe("annual");
    expect(result.annual).toMatchObject({
      monthsWorked: 8,
      grossIncome: "140000000.00",
      occupationalCost: "4000000.00",
      netIncome: "135200000.00",
      taxableIncome: "81200000.00",
      annualTax: "6180000.00",
      withheldThisEmployer: "9800000.00",
    });
    expect(result.pph21).toBe("-3620000.00");
  });

  it("PT AB dengan bukti potong PT W: Desember Rp19.320.000 − Rp6.180.000 − Rp6.075.000 = Rp7.065.000", () => {
    const previous = [9, 10, 11].map((month) => record(month, "22500000", "2025000", "100000"));
    expect(pph({ month: 9, gross: "22500000" }).pph21).toBe("2025000.00");
    const result = pph({
      month: 12,
      gross: "22500000",
      pension: "100000",
      previousPeriods: previous,
      previousEmployer: { netIncome: "135200000", pph21Withheld: "6180000" },
    });
    expect(result.annual).toMatchObject({
      grossIncome: "90000000.00",
      occupationalCost: "2000000.00",
      netIncome: "87600000.00",
      previousEmployerNetIncome: "135200000.00",
      taxableIncome: "168800000.00",
      annualTax: "19320000.00",
      withheldThisEmployer: "6075000.00",
      withheldPreviousEmployer: "6180000.00",
    });
    expect(result.pph21).toBe("7065000.00");
  });
});

describe("contoh DJP — kategori B & C", () => {
  it("Tuan F, K/3: 11% × Rp30.000.000 = Rp3.300.000 (TER C)", () => {
    const result = pph({ ptkpStatus: "K/3", gross: "30000000" });
    expect(result.terKind).toBe("ter_c");
    expect(result.pph21).toBe("3300000.00");
  });

  it("Tuan H, K/2: 0,5% × Rp6.800.000 = Rp34.000 (TER B)", () => {
    const result = pph({ ptkpStatus: "K/2", month: 7, gross: "6800000", pension: "100000" });
    expect(result.terKind).toBe("ter_b");
    expect(result.pph21).toBe("34000.00");
  });
});

describe("TER bulanan", () => {
  it("tepat di batas lapis memakai lapis itu; satu rupiah di atasnya lapis berikutnya", () => {
    expect(pph({ gross: "5400000" }).terRatePercent).toBe("0.0000");
    expect(pph({ gross: "5400000" }).pph21).toBe("0.00");
    expect(pph({ gross: "5400001" }).terRatePercent).toBe("0.2500");
  });

  it("lapis terakhir tanpa batas atas (TER A 34%)", () => {
    expect(pph({ gross: "2000000000" }).pph21).toBe("680000000.00");
  });

  it("pembulatan rupiah HALF_UP", () => {
    // 0,25% × 5.600.200 = 14.000,5 → 14.001; 0,25% × 5.600.196 = 14.000,49 → 14.000
    expect(pph({ gross: "5600200" }).pph21).toBe("14001.00");
    expect(pph({ gross: "5600196" }).pph21).toBe("14000.00");
  });

  it("THR ikut dasar bulan dibayar → lapis lebih tinggi bulan itu saja", () => {
    expect(pph({ month: 3, gross: "10000000" }).pph21).toBe("200000.00");
    // Bulan THR: 10 jt + THR 10 jt = 20 jt → TER A 9%
    expect(pph({ month: 4, gross: "20000000" }).pph21).toBe("1800000.00");
  });

  it("langkah perhitungan bisa dibaca", () => {
    expect(pph({ ptkpStatus: "K/0", gross: "30080000" }).steps).toEqual([
      "Status PTKP K/0 → TER kategori A",
      "Penghasilan bruto Rp 30.080.000 → tarif 13%",
      "PPh 21 = 13% × Rp 30.080.000 = Rp 3.910.400",
    ]);
  });
});

describe("masa pajak terakhir", () => {
  const fullYear = (gross: string, withheld: string) => Array.from({ length: 11 }, (_, i) => record(i + 1, gross, withheld));

  it("Desember selalu masa terakhir walau endsEmployment false", () => {
    expect(pph({ month: 12, gross: "10000000", previousPeriods: fullYear("10000000", "200000") }).method).toBe("annual");
  });

  it("biaya jabatan setahun dibatasi Rp6 jt; di bawah batas = 5% bruto", () => {
    const high = pph({ month: 12, gross: "20000000", previousPeriods: fullYear("20000000", "0") });
    expect(high.annual?.occupationalCost).toBe("6000000.00");
    const low = pph({ month: 12, gross: "5000000", previousPeriods: fullYear("5000000", "0") });
    expect(low.annual?.occupationalCost).toBe("3000000.00");
  });

  it("PKP dibulatkan ke bawah ribuan penuh", () => {
    // Bruto 1 bulan 60.000.000 → biaya jabatan 500.000; neto 59.500.000 − iuran 1.001 = 59.498.999; − PTKP 54 jt = 5.498.999
    const result = pph({ month: 1, endsEmployment: true, gross: "60000000", pension: "1001" });
    expect(result.annual?.taxableIncome).toBe("5498000.00");
    expect(result.annual?.annualTax).toBe("274900.00");
  });

  it("neto di bawah PTKP → PKP 0, seluruh potongan dikembalikan", () => {
    const result = pph({ month: 12, gross: "4000000", previousPeriods: fullYear("4000000", "10000") });
    expect(result.annual?.taxableIncome).toBe("0.00");
    expect(result.annual?.annualTax).toBe("0.00");
    expect(result.pph21).toBe("-110000.00");
  });

  it("tarif Pasal 17 lintas lapis sampai 35%", () => {
    // PKP 6 M: 5% × 60 jt + 15% × 190 jt + 25% × 250 jt + 30% × 4,5 M + 35% × 1 M
    const result = pph({ ptkpStatus: "TK/0", month: 1, endsEmployment: true, gross: "6054500000" });
    expect(result.annual?.occupationalCost).toBe("500000.00");
    expect(result.annual?.taxableIncome).toBe("6000000000.00");
    expect(result.annual?.annualTax).toBe("1794000000.00");
  });

  it("masa sebelumnya yang pernah mengembalikan kelebihan potong (negatif) ikut dihitung", () => {
    const result = pph({ month: 3, endsEmployment: true, gross: "10000000", previousPeriods: [record(1, "10000000", "200000"), record(2, "10000000", "-50000")] });
    expect(result.annual?.withheldThisEmployer).toBe("150000.00");
  });
});

describe("pph21IncomeFromPayroll", () => {
  it("bruto = pendapatan + premi Kesehatan/JKK/JKM pemberi kerja; iuran pensiun = JHT + JP pegawai", () => {
    const payroll = calculatePayroll({
      components: [
        { code: "GAPOK", name: "Gaji pokok", kind: "base_salary", amount: "8000000" },
        { code: "TUNJ", name: "Tunjangan jabatan", kind: "fixed_allowance", amount: "2000000" },
        { code: "THR", name: "THR", kind: "variable_allowance", amount: "10000000" },
      ],
      bpjs: { programs: ["kesehatan", "jht", "jp", "jkk", "jkm"], jkkRiskLevel: 1, minimumWage: null },
      bpjsRates: [
        { program: "kesehatan", jkkRiskLevel: null, employerRatePercent: "4.0000", employeeRatePercent: "1.0000", wageCap: "12000000.00", ...version },
        { program: "jht", jkkRiskLevel: null, employerRatePercent: "3.7000", employeeRatePercent: "2.0000", wageCap: null, ...version },
        { program: "jp", jkkRiskLevel: null, employerRatePercent: "2.0000", employeeRatePercent: "1.0000", wageCap: "11086300.00", ...version },
        { program: "jkk", jkkRiskLevel: 1, employerRatePercent: "0.2400", employeeRatePercent: "0.0000", wageCap: null, ...version },
        { program: "jkm", jkkRiskLevel: null, employerRatePercent: "0.3000", employeeRatePercent: "0.0000", wageCap: null, ...version },
      ],
    });
    // 20.000.000 + Kesehatan 400.000 + JKK 24.000 + JKM 30.000 (JHT 370.000 & JP 200.000 pemberi kerja tidak ikut)
    expect(pph21IncomeFromPayroll(payroll)).toEqual({ grossIncome: "20454000.00", pensionContribution: "300000.00" });
  });
});

describe("input tidak valid", () => {
  it("masa pajak di luar 1–12", () => {
    expect(() => pph({ month: 0, gross: "1" })).toThrow(PayrollInputError);
    expect(() => pph({ month: 13, gross: "1" })).toThrow(PayrollInputError);
  });

  it("masa sebelumnya ganda atau tidak sebelum masa ini", () => {
    expect(() => pph({ month: 12, gross: "1", previousPeriods: [record(3, "1", "0"), record(3, "1", "0")] })).toThrow("lebih dari sekali");
    expect(() => pph({ month: 12, gross: "1", previousPeriods: [record(12, "1", "0")] })).toThrow(PayrollInputError);
  });

  it("bruto negatif / bukan angka", () => {
    expect(() => pph({ gross: "-1" })).toThrow(PayrollInputError);
    expect(() => pph({ gross: "abc" })).toThrow(PayrollInputError);
  });

  it("PTKP atau tabel tarif tidak tersedia", () => {
    expect(() => pph({ gross: "1", regulations: { ...REGULATIONS, ptkp: [] } })).toThrow("PTKP TK/0 tidak tersedia");
    expect(() => pph({ gross: "1", regulations: { ...REGULATIONS, taxTables: [] } })).toThrow("ter_a tidak tersedia");
  });
});
