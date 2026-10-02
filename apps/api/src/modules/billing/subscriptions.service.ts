import { billingPrices, tenantSubscriptions } from "@exapay/db";
import {
  type SubscriptionRow,
  type SubscriptionState,
  subscriptionDate,
  subscriptionStateAt,
  type TenantSubscriptionStart,
} from "@exapay/shared";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";

import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingPrice = {
  pricePerEmployee: string;
  minBilledEmployees: number;
  trialDays: number;
  graceDays: number;
};

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  // Harga platform yang berlaku pada tanggal tsb (zona platform — harga sama untuk semua usaha). Migration 0030 menjamin selalu ada versi sejak 2024-01-01.
  async priceAt(tx: Transaction | Database, now: Date): Promise<BillingPrice> {
    const date = subscriptionDate(now);
    const [price] = await tx
      .select({
        pricePerEmployee: billingPrices.pricePerEmployee,
        minBilledEmployees: billingPrices.minBilledEmployees,
        trialDays: billingPrices.trialDays,
        graceDays: billingPrices.graceDays,
      })
      .from(billingPrices)
      .where(and(lte(billingPrices.effectiveFrom, date), or(isNull(billingPrices.effectiveTo), gte(billingPrices.effectiveTo, date))))
      .orderBy(desc(billingPrices.effectiveFrom))
      .limit(1);
    if (!price) throw new Error(`[billing/price] tidak ada harga berlaku pada ${date}`);
    return price;
  }

  // Dipanggil di transaksi pembuatan tenant (signup → selalu trial; super-admin → trial atau gratis/pilot).
  // Trigger guard_tenant_subscription menolak selain trial standar jika pemanggil bukan super-admin.
  async start(tx: Transaction, ctx: TenantContext, start: TenantSubscriptionStart, now: Date = new Date()): Promise<void> {
    let values: typeof tenantSubscriptions.$inferInsert;
    if (start === "trial") {
      const { trialDays } = await this.priceAt(tx, now);
      values = { tenantId: ctx.tenantId, status: "trialing", trialEndsAt: new Date(now.getTime() + trialDays * DAY_MS) };
    } else {
      values = { tenantId: ctx.tenantId, status: "complimentary" };
    }
    await tx.insert(tenantSubscriptions).values(values);
    await this.audit.record(tx, ctx, {
      entity: "subscription",
      entityId: ctx.tenantId,
      action: "start",
      after: { status: values.status, trialEndsAt: values.trialEndsAt?.toISOString() ?? null },
    });
  }

  // null = tenant tanpa baris langganan (seharusnya tidak terjadi: migration 0030 + pembuatan tenant)
  async stateOf(ctx: TenantContext, now: Date = new Date()): Promise<SubscriptionState | null> {
    return withTenant(this.db, ctx, async (tx) => {
      const row = await this.rowOf(tx, ctx);
      return row ? this.stateFrom(tx, row, now) : null;
    });
  }

  async rowOf(tx: Transaction, ctx: TenantContext): Promise<SubscriptionRow | null> {
    const [row] = await tx
      .select({
        status: tenantSubscriptions.status,
        trialEndsAt: tenantSubscriptions.trialEndsAt,
        currentPeriodEndsAt: tenantSubscriptions.currentPeriodEndsAt,
      })
      .from(tenantSubscriptions)
      .where(eq(tenantSubscriptions.tenantId, ctx.tenantId));
    return row ?? null;
  }

  async stateFrom(tx: Transaction, row: SubscriptionRow, now: Date): Promise<SubscriptionState> {
    // Tenggang tidak berlaku untuk gratis → tidak perlu membaca harga
    const graceDays = row.status === "complimentary" ? 0 : (await this.priceAt(tx, now)).graceDays;
    return subscriptionStateAt(row, graceDays, now);
  }
}
