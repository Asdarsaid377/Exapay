import { payrollRuns, tenants } from "@exapay/db";
import { Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";
import { type PeriodRange, payrollPeriodRange, shiftMonth } from "./attendance-period.js";

export type PayrollPeriod = PeriodRange & {
  month: string;
  // Tanggal tutup buku usaha saat ini (null = akhir bulan)
  cutoffDay: number | null;
  // Rentang berbeda dari rentang baku karena tutup buku berubah setelah periode bulan lalu final
  transition: boolean;
};

// Periode absensi payroll per bulan (feature 30b) — dipakai rekap absensi, pratinjau potongan, dan draf payroll agar
// rentangnya selalu sama. Periode yang sudah final memakai rentang tersimpan di payroll_runs (dibaca modul payroll).
@Injectable()
export class AttendancePeriodsService {
  async cutoffDay(tx: Transaction, ctx: TenantContext): Promise<number | null> {
    const [tenant] = await tx.select({ cutoffDay: tenants.attendanceCutoffDay }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    if (!tenant) throw new NotFoundException("Usaha tidak ditemukan");
    return tenant.cutoffDay;
  }

  // Rentang periode draf/rekap bulan `month` dari tutup buku saat ini + akhir periode final bulan sebelumnya
  async payrollPeriod(tx: Transaction, ctx: TenantContext, month: string): Promise<PayrollPeriod> {
    const cutoffDay = await this.cutoffDay(tx, ctx);
    const previousMonth = shiftMonth(month, -1);
    const [previous] = await tx
      .select({ periodEnd: payrollRuns.periodEnd })
      .from(payrollRuns)
      .where(and(eq(payrollRuns.periodMonth, `${previousMonth}-01`), eq(payrollRuns.status, "final")));
    const range = payrollPeriodRange(month, cutoffDay, previous?.periodEnd ? { month: previousMonth, periodEnd: previous.periodEnd } : null);
    return { month, cutoffDay, ...range };
  }
}
