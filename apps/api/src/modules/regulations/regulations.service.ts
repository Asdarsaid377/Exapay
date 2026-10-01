import { bpjsRates, minimumWages, pph21Parameters, ptkpRates, regencies, taxRateBrackets, taxRateTables } from "@exapay/db";
import {
  BPJS_PROGRAMS,
  JKK_RISK_LEVELS,
  PTKP_STATUSES,
  TAX_RATE_KINDS,
  type BpjsRate,
  type JkkRiskLevel,
  type MinimumWage,
  type PayrollRegulations,
  type PtkpRate,
  type TaxRateTable,
  type TerKind,
} from "@exapay/shared";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, gte, isNull, lte, or, type Column, type SQL } from "drizzle-orm";

import { DRIZZLE } from "../../database/database.module.js";
import type { Database } from "../../database/tenant-transaction.js";

// Data regulasi untuk tanggal ini belum ada / tidak lengkap di database (perlu migration data baru).
export class RegulationDataMissingError extends Error {
  constructor(
    readonly date: string,
    readonly missing: string[],
  ) {
    super(`Data regulasi untuk tanggal ${date} belum lengkap: ${missing.join(", ")}`);
    this.name = "RegulationDataMissingError";
  }
}

// Versi yang berlaku pada tanggal (rentang inklusif; effective_to null = tanpa batas atas)
function effectiveOn(from: Column, to: Column, date: string): SQL | undefined {
  return and(lte(from, date), or(isNull(to), gte(to, date)));
}

function isJkkRiskLevel(value: number): value is JkkRiskLevel {
  return (JKK_RISK_LEVELS as readonly number[]).includes(value);
}

function isTerKind(kind: string): kind is TerKind {
  return kind !== "pasal_17";
}

@Injectable()
export class RegulationsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Semua aturan payroll yang berlaku pada `date` (YYYY-MM-DD). Data referensi platform (bukan data tenant):
  // dibaca tanpa withTenant — policy reference_read mengizinkan semua baris. Tidak lengkap → RegulationDataMissingError,
  // agar payroll tidak pernah dihitung dengan aturan yang hilang diam-diam.
  async forDate(date: string): Promise<PayrollRegulations> {
    const [bpjsRows, tableRows, ptkpRows, pph21Rows] = await Promise.all([
      this.db
        .select()
        .from(bpjsRates)
        .where(effectiveOn(bpjsRates.effectiveFrom, bpjsRates.effectiveTo, date))
        .orderBy(asc(bpjsRates.program), asc(bpjsRates.jkkRiskLevel)),
      this.db
        .select({
          kind: taxRateTables.kind,
          effectiveFrom: taxRateTables.effectiveFrom,
          effectiveTo: taxRateTables.effectiveTo,
          source: taxRateTables.source,
          seq: taxRateBrackets.seq,
          incomeUpTo: taxRateBrackets.incomeUpTo,
          ratePercent: taxRateBrackets.ratePercent,
        })
        .from(taxRateTables)
        .innerJoin(
          taxRateBrackets,
          and(eq(taxRateBrackets.kind, taxRateTables.kind), eq(taxRateBrackets.effectiveFrom, taxRateTables.effectiveFrom)),
        )
        .where(effectiveOn(taxRateTables.effectiveFrom, taxRateTables.effectiveTo, date))
        .orderBy(asc(taxRateTables.kind), asc(taxRateBrackets.seq)),
      this.db.select().from(ptkpRates).where(effectiveOn(ptkpRates.effectiveFrom, ptkpRates.effectiveTo, date)),
      this.db.select().from(pph21Parameters).where(effectiveOn(pph21Parameters.effectiveFrom, pph21Parameters.effectiveTo, date)),
    ]);

    const bpjs: BpjsRate[] = bpjsRows.map((row) => ({
      program: row.program,
      jkkRiskLevel: row.jkkRiskLevel !== null && isJkkRiskLevel(row.jkkRiskLevel) ? row.jkkRiskLevel : null,
      employerRatePercent: row.employerRatePercent,
      employeeRatePercent: row.employeeRatePercent,
      wageCap: row.wageCap,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      source: row.source,
    }));

    const tables = new Map<string, TaxRateTable>();
    for (const row of tableRows) {
      const table = tables.get(row.kind) ?? {
        kind: row.kind,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        source: row.source,
        brackets: [],
      };
      table.brackets.push({ incomeUpTo: row.incomeUpTo, ratePercent: row.ratePercent });
      tables.set(row.kind, table);
    }

    const ptkp: PtkpRate[] = [];
    for (const row of ptkpRows) {
      if (!isTerKind(row.terKind)) continue; // dicegah CHECK ptkp_rates_values
      ptkp.push({
        status: row.status,
        annualAmount: row.annualAmount,
        terKind: row.terKind,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        source: row.source,
      });
    }
    ptkp.sort((a, b) => PTKP_STATUSES.indexOf(a.status) - PTKP_STATUSES.indexOf(b.status));

    const missing: string[] = [];
    for (const program of BPJS_PROGRAMS) {
      if (program === "jkk") {
        for (const level of JKK_RISK_LEVELS) {
          if (!bpjs.some((rate) => rate.program === "jkk" && rate.jkkRiskLevel === level)) missing.push(`BPJS jkk risiko ${level}`);
        }
      } else if (!bpjs.some((rate) => rate.program === program)) {
        missing.push(`BPJS ${program}`);
      }
    }
    for (const kind of TAX_RATE_KINDS) {
      if (!tables.has(kind)) missing.push(`tarif ${kind}`);
    }
    for (const status of PTKP_STATUSES) {
      if (!ptkp.some((rate) => rate.status === status)) missing.push(`PTKP ${status}`);
    }
    const pph21 = pph21Rows[0];
    if (!pph21) missing.push("parameter PPh 21");
    if (missing.length > 0 || !pph21) throw new RegulationDataMissingError(date, missing);

    return {
      date,
      bpjs,
      taxTables: TAX_RATE_KINDS.flatMap((kind) => tables.get(kind) ?? []),
      ptkp,
      pph21: {
        occupationalCostRatePercent: pph21.occupationalCostRatePercent,
        occupationalCostMonthlyMax: pph21.occupationalCostMonthlyMax,
        occupationalCostAnnualMax: pph21.occupationalCostAnnualMax,
        effectiveFrom: pph21.effectiveFrom,
        effectiveTo: pph21.effectiveTo,
        source: pph21.source,
      },
    };
  }

  // Upah minimum kota/kabupaten pada tanggal: UMK jika ada, selain itu UMP provinsinya; null jika keduanya belum ada datanya.
  async minimumWage(regencyCode: string, date: string): Promise<MinimumWage | null> {
    const [regency] = await this.db
      .select({ provinceCode: regencies.provinceCode })
      .from(regencies)
      .where(eq(regencies.code, regencyCode));
    if (!regency) return null;

    const rows = await this.db
      .select()
      .from(minimumWages)
      .where(
        and(
          or(eq(minimumWages.regencyCode, regencyCode), eq(minimumWages.provinceCode, regency.provinceCode)),
          effectiveOn(minimumWages.effectiveFrom, minimumWages.effectiveTo, date),
        ),
      );
    const row = rows.find((r) => r.regencyCode !== null) ?? rows[0];
    if (!row) return null;
    return {
      scope: row.regencyCode !== null ? "regency" : "province",
      areaCode: row.regencyCode ?? regency.provinceCode,
      monthlyAmount: row.monthlyAmount,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      source: row.source,
    };
  }
}
