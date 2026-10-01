import { provinces, regencies, tenants } from "@exapay/db";
import type { CompanyProfile, UpdateCompanyProfile } from "@exapay/shared";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";

// Kolom profil yang bisa diubah — juga menjadi isi before/after audit log
type ProfileFields = Pick<UpdateCompanyProfile, "name" | "address" | "npwp" | "regencyCode" | "payday" | "attendanceCutoffDay">;

const PROFILE_FIELDS = ["name", "address", "npwp", "regencyCode", "payday", "attendanceCutoffDay"] as const;

// Profil usaha aktif (feature 09) + tanggal tutup buku absensi payroll (feature 30b — berlaku untuk periode draf;
// periode final memakai rentang tersimpan). Baris tenant dibaca lewat policy tenant_isolation (hanya tenant aktif).
@Injectable()
export class CompanyService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthUser): Promise<CompanyProfile> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, (tx) => this.load(tx, ctx));
  }

  async update(user: AuthUser, input: UpdateCompanyProfile): Promise<CompanyProfile> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const [current] = await tx
        .select({
          name: tenants.name,
          address: tenants.address,
          npwp: tenants.npwp,
          regencyCode: tenants.regencyCode,
          payday: tenants.payday,
          attendanceCutoffDay: tenants.attendanceCutoffDay,
        })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .for("update");
      if (!current) throw new NotFoundException("Usaha tidak ditemukan");

      if (input.regencyCode) {
        const [regency] = await tx.select({ code: regencies.code }).from(regencies).where(eq(regencies.code, input.regencyCode));
        if (!regency) throw new BadRequestException("Kota/kabupaten tidak dikenal");
      }

      // Audit hanya kolom yang berubah; tidak ada perubahan → tidak ada update/audit
      const before: Partial<ProfileFields> = {};
      const after: Partial<ProfileFields> = {};
      for (const field of PROFILE_FIELDS) {
        if (current[field] !== input[field]) {
          Object.assign(before, { [field]: current[field] });
          Object.assign(after, { [field]: input[field] });
        }
      }
      if (Object.keys(after).length > 0) {
        await tx
          .update(tenants)
          .set({
            name: input.name,
            address: input.address,
            npwp: input.npwp,
            regencyCode: input.regencyCode,
            payday: input.payday,
            attendanceCutoffDay: input.attendanceCutoffDay,
          })
          .where(eq(tenants.id, ctx.tenantId));
        await this.audit.record(tx, ctx, { entity: "tenant", entityId: ctx.tenantId, action: "update_profile", before, after });
      }
      return this.load(tx, ctx);
    });
  }

  private async load(tx: Transaction, ctx: TenantContext): Promise<CompanyProfile> {
    const [row] = await tx
      .select({
        name: tenants.name,
        address: tenants.address,
        npwp: tenants.npwp,
        payday: tenants.payday,
        attendanceCutoffDay: tenants.attendanceCutoffDay,
        updatedAt: tenants.updatedAt,
        regencyCode: regencies.code,
        regencyName: regencies.name,
        provinceCode: provinces.code,
        provinceName: provinces.name,
      })
      .from(tenants)
      .leftJoin(regencies, eq(regencies.code, tenants.regencyCode))
      .leftJoin(provinces, eq(provinces.code, regencies.provinceCode))
      .where(eq(tenants.id, ctx.tenantId));
    if (!row) throw new NotFoundException("Usaha tidak ditemukan");

    const { regencyCode, regencyName, provinceCode, provinceName, updatedAt, ...profile } = row;
    return {
      ...profile,
      regency:
        regencyCode && regencyName && provinceCode && provinceName ? { code: regencyCode, name: regencyName, provinceCode, provinceName } : null,
      updatedAt: updatedAt.toISOString(),
    };
  }
}
