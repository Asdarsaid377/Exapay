import { auditLogs } from "@exapay/db";
import { Injectable } from "@nestjs/common";

import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";

export type AuditEntry = {
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
};

@Injectable()
export class AuditService {
  // Dipanggil di dalam transaksi withTenant yang sama dengan mutasinya:
  // jika mutasi di-rollback, audit log ikut batal. Tenant & aktor diambil dari konteks, bukan dari caller.
  async record(tx: Transaction, ctx: TenantContext, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLogs).values({
      tenantId: ctx.tenantId,
      actorUserId: ctx.userId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  }
}
