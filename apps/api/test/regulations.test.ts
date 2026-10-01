import * as schema from "@exapay/db";
import { bpjsRates, minimumWages } from "@exapay/db";
import type { PayrollRegulations, TaxRateKind } from "@exapay/shared";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import type { Database } from "../src/database/tenant-transaction.js";
import { RegulationDataMissingError, RegulationsService } from "../src/modules/regulations/regulations.service.js";

// Verifikasi feature 24: query aturan untuk tanggal tertentu mengembalikan versi yang benar (seed migration 0022),
// dijalankan sebagai app_user (role runtime API).

let pool: pg.Pool;
let db: Database;
let service: RegulationsService;

beforeAll(() => {
  pool = new pg.Pool({ connectionString: inject("testDatabaseUrl") });
  db = drizzle({ client: pool, schema });
  service = new RegulationsService(db);
});

afterAll(async () => {
  await pool.end();
});

function jpCap(regs: PayrollRegulations): string | null | undefined {
  return regs.bpjs.find((rate) => rate.program === "jp")?.wageCap;
}

function brackets(regs: PayrollRegulations, kind: TaxRateKind) {
  const table = regs.taxTables.find((t) => t.kind === kind);
  if (!table) throw new Error(`tabel ${kind} tidak ada`);
  return table.brackets;
}

// TER: lapis pertama dengan income_up_to ≥ penghasilan (null = tanpa batas)
function terRate(regs: PayrollRegulations, kind: TaxRateKind, income: number): string | undefined {
  return brackets(regs, kind).find((b) => b.incomeUpTo === null || Number(b.incomeUpTo) >= income)?.ratePercent;
}

describe("versi berlaku-tanggal", () => {
  it("batas upah JP mengikuti versi per tanggal (berganti tiap 1 Maret)", async () => {
    expect(jpCap(await service.forDate("2024-01-15"))).toBe("9559600.00");
    expect(jpCap(await service.forDate("2024-02-29"))).toBe("9559600.00");
    expect(jpCap(await service.forDate("2024-03-01"))).toBe("10042300.00");
    expect(jpCap(await service.forDate("2025-02-28"))).toBe("10042300.00");
    expect(jpCap(await service.forDate("2025-03-01"))).toBe("10547400.00");
    expect(jpCap(await service.forDate("2026-02-28"))).toBe("10547400.00");
    expect(jpCap(await service.forDate("2026-03-01"))).toBe("11086300.00");
    expect(jpCap(await service.forDate("2030-12-31"))).toBe("11086300.00");
  });

  it("satu tanggal hanya mengembalikan satu versi per program/kelompok risiko", async () => {
    const regs = await service.forDate("2026-10-01");
    const keys = regs.bpjs.map((rate) => `${rate.program}:${rate.jkkRiskLevel ?? "-"}`);
    expect(keys).toEqual(["kesehatan:-", "jht:-", "jp:-", "jkk:1", "jkk:2", "jkk:3", "jkk:4", "jkk:5", "jkm:-"]);
    expect(regs.bpjs.every((rate) => rate.source.length > 0)).toBe(true);
  });

  it("tarif BPJS 2026 sesuai aturan", async () => {
    const regs = await service.forDate("2026-10-01");
    const byKey = new Map(regs.bpjs.map((rate) => [`${rate.program}:${rate.jkkRiskLevel ?? "-"}`, rate]));
    expect(byKey.get("kesehatan:-")).toMatchObject({ employerRatePercent: "4.0000", employeeRatePercent: "1.0000", wageCap: "12000000.00" });
    expect(byKey.get("jht:-")).toMatchObject({ employerRatePercent: "3.7000", employeeRatePercent: "2.0000", wageCap: null });
    expect(byKey.get("jp:-")).toMatchObject({ employerRatePercent: "2.0000", employeeRatePercent: "1.0000", effectiveFrom: "2026-03-01" });
    expect(byKey.get("jkm:-")).toMatchObject({ employerRatePercent: "0.3000", employeeRatePercent: "0.0000" });
    expect([1, 2, 3, 4, 5].map((level) => byKey.get(`jkk:${level}`)?.employerRatePercent)).toEqual([
      "0.2400",
      "0.5400",
      "0.8900",
      "1.2700",
      "1.7400",
    ]);
  });

  it("sebelum cakupan data → error jelas, bukan aturan kosong", async () => {
    await expect(service.forDate("2023-12-31")).rejects.toBeInstanceOf(RegulationDataMissingError);
    await expect(service.forDate("2023-12-31")).rejects.toThrow(/BPJS kesehatan.*tarif ter_a.*PTKP TK\/0.*parameter PPh 21/);
  });
});

describe("PPh 21", () => {
  it("tabel TER A/B/C dan Pasal 17 lengkap, lapis naik, lapis terakhir tanpa batas", async () => {
    const regs = await service.forDate("2026-10-01");
    expect(regs.taxTables.map((t) => [t.kind, t.brackets.length])).toEqual([
      ["ter_a", 44],
      ["ter_b", 40],
      ["ter_c", 41],
      ["pasal_17", 5],
    ]);
    for (const table of regs.taxTables) {
      const bounds = table.brackets.slice(0, -1).map((b) => Number(b.incomeUpTo));
      expect(bounds, table.kind).toEqual([...bounds].sort((a, b) => a - b));
      expect(new Set(bounds).size, table.kind).toBe(bounds.length);
      expect(table.brackets.at(-1)?.incomeUpTo, table.kind).toBeNull();
      expect(table.brackets.at(-1)?.ratePercent, table.kind).toBe(table.kind === "pasal_17" ? "35.0000" : "34.0000");
    }
  });

  it("tarif TER di batas lapis (≤ batas atas = lapis itu)", async () => {
    const regs = await service.forDate("2026-10-01");
    expect(terRate(regs, "ter_a", 5_400_000)).toBe("0.0000");
    expect(terRate(regs, "ter_a", 5_400_001)).toBe("0.2500");
    expect(terRate(regs, "ter_a", 10_000_000)).toBe("2.0000");
    expect(terRate(regs, "ter_a", 1_500_000_000)).toBe("34.0000");
    expect(terRate(regs, "ter_b", 6_200_000)).toBe("0.0000");
    expect(terRate(regs, "ter_b", 9_200_001)).toBe("1.5000");
    expect(terRate(regs, "ter_c", 6_600_001)).toBe("0.2500");
    expect(terRate(regs, "ter_c", 12_050_001)).toBe("3.0000");
  });

  it("tarif Pasal 17 (UU HPP)", async () => {
    const regs = await service.forDate("2026-12-31");
    expect(brackets(regs, "pasal_17")).toEqual([
      { incomeUpTo: "60000000.00", ratePercent: "5.0000" },
      { incomeUpTo: "250000000.00", ratePercent: "15.0000" },
      { incomeUpTo: "500000000.00", ratePercent: "25.0000" },
      { incomeUpTo: "5000000000.00", ratePercent: "30.0000" },
      { incomeUpTo: null, ratePercent: "35.0000" },
    ]);
  });

  it("PTKP & kategori TER per status, biaya jabatan", async () => {
    const regs = await service.forDate("2026-10-01");
    expect(regs.ptkp.map((p) => [p.status, p.annualAmount, p.terKind])).toEqual([
      ["TK/0", "54000000.00", "ter_a"],
      ["TK/1", "58500000.00", "ter_a"],
      ["TK/2", "63000000.00", "ter_b"],
      ["TK/3", "67500000.00", "ter_b"],
      ["K/0", "58500000.00", "ter_a"],
      ["K/1", "63000000.00", "ter_b"],
      ["K/2", "67500000.00", "ter_b"],
      ["K/3", "72000000.00", "ter_c"],
    ]);
    expect(regs.pph21).toMatchObject({
      occupationalCostRatePercent: "5.0000",
      occupationalCostMonthlyMax: "500000.00",
      occupationalCostAnnualMax: "6000000.00",
    });
  });
});

describe("upah minimum", () => {
  it("kota tanpa data UMK memakai UMP provinsinya", async () => {
    expect(await service.minimumWage("73.71", "2026-06-15")).toMatchObject({
      scope: "province",
      areaCode: "73",
      monthlyAmount: "3921088.00",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-12-31",
    });
    expect((await service.minimumWage("33.74", "2026-01-01"))?.monthlyAmount).toBe("2327386.07");
  });

  it("UMP hanya berlaku di tahunnya; tahun tanpa data → null", async () => {
    expect(await service.minimumWage("73.71", "2025-12-31")).toBeNull();
    expect(await service.minimumWage("73.71", "2027-01-01")).toBeNull();
    expect(await service.minimumWage("99.99", "2026-06-15")).toBeNull();
  });

  it("UMP 38 provinsi 2026 terisi", async () => {
    const rows = await db.select({ provinceCode: minimumWages.provinceCode }).from(minimumWages);
    expect(new Set(rows.map((r) => r.provinceCode)).size).toBe(38);
  });
});

describe("hak akses app_user", () => {
  it("tidak bisa mengubah data regulasi", async () => {
    const attempt = db.insert(bpjsRates).values({
      program: "jht",
      employerRatePercent: "0",
      employeeRatePercent: "0",
      effectiveFrom: "2099-01-01",
      source: "test",
    });
    await expect(attempt).rejects.toThrow();
    await expect(pool.query("update minimum_wages set monthly_amount = 1")).rejects.toThrow(/permission denied/);
  });
});
