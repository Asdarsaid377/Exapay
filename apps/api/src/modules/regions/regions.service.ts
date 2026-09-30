import { provinces, regencies } from "@exapay/db";
import type { RegionProvince } from "@exapay/shared";
import { Inject, Injectable } from "@nestjs/common";
import { asc, eq } from "drizzle-orm";

import { DRIZZLE } from "../../database/database.module.js";
import type { Database } from "../../database/tenant-transaction.js";

@Injectable()
export class RegionsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // Data referensi platform (bukan data tenant): dibaca tanpa withTenant — policy reference_read mengizinkan semua baris.
  async list(): Promise<RegionProvince[]> {
    const rows = await this.db
      .select({ provinceCode: provinces.code, provinceName: provinces.name, code: regencies.code, name: regencies.name })
      .from(regencies)
      .innerJoin(provinces, eq(provinces.code, regencies.provinceCode))
      .orderBy(asc(provinces.name), asc(regencies.name));

    const byProvince = new Map<string, RegionProvince>();
    for (const row of rows) {
      const province = byProvince.get(row.provinceCode) ?? { code: row.provinceCode, name: row.provinceName, regencies: [] };
      province.regencies.push({ code: row.code, name: row.name });
      byProvince.set(row.provinceCode, province);
    }
    return [...byProvince.values()];
  }
}
