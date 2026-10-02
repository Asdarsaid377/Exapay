import { employees } from "@exapay/db";
import {
  type BillingOverview,
  type SubscriptionRow,
  type SubscriptionState,
  type SubscriptionSummary,
  subscriptionDate,
  subscriptionDaysUntil,
  subscriptionNoticeAt,
} from "@exapay/shared";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Decimal } from "decimal.js";
import { isNull, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, withTenant } from "../../database/tenant-transaction.js";
import { SubscriptionsService } from "./subscriptions.service.js";

// Halaman langganan & banner pengingat (feature 40). Tagihan & pembayaran menyusul di feature 41.
@Injectable()
export class BillingService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async status(user: AuthUser, now: Date = new Date()): Promise<SubscriptionSummary> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const row = await this.subscriptions.rowOf(tx, ctx);
      if (!row) throw new NotFoundException("Data langganan usaha ini tidak ditemukan");
      return summaryOf(row, await this.subscriptions.stateFrom(tx, row, now), now);
    });
  }

  async overview(user: AuthUser, now: Date = new Date()): Promise<BillingOverview> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const row = await this.subscriptions.rowOf(tx, ctx);
      if (!row) throw new NotFoundException("Data langganan usaha ini tidak ditemukan");
      const state = await this.subscriptions.stateFrom(tx, row, now);

      // Tagihan berikutnya terbit di akhir trial/periode; jika sudah lewat (tenggang/baca-saja) atau gratis → hari ini
      const billingAt = state.endsAt && state.endsAt > now ? state.endsAt : now;
      const price = await this.subscriptions.priceAt(tx, billingAt);
      // Karyawan aktif = belum punya tanggal keluar (sama dengan hitungan "Aktif" di /employees)
      const [counted] = await tx.select({ active: sql<number>`count(*)::int` }).from(employees).where(isNull(employees.endDate));
      const activeEmployees = counted?.active ?? 0;
      const billedEmployees = Math.max(activeEmployees, price.minBilledEmployees);

      return {
        subscription: summaryOf(row, state, now),
        estimate: {
          priceDate: subscriptionDate(billingAt),
          pricePerEmployee: price.pricePerEmployee,
          minBilledEmployees: price.minBilledEmployees,
          activeEmployees,
          billedEmployees,
          amount: new Decimal(price.pricePerEmployee).times(billedEmployees).toFixed(2),
          graceDays: price.graceDays,
        },
      };
    });
  }
}

function summaryOf(row: SubscriptionRow, state: SubscriptionState, now: Date): SubscriptionSummary {
  const deadline = state.status === "past_due" ? state.graceEndsAt : state.status === "trialing" || state.status === "active" ? state.endsAt : null;
  return {
    status: state.status,
    baseStatus: row.status,
    endsAt: state.endsAt?.toISOString() ?? null,
    graceEndsAt: state.graceEndsAt?.toISOString() ?? null,
    daysLeft: deadline ? subscriptionDaysUntil(deadline, now) : null,
    notice: subscriptionNoticeAt(state, now),
  };
}
