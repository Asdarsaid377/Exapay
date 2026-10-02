import { billingInvoices, tenantSubscriptions } from "@exapay/db";
import { addSubscriptionMonth, BILLING_DECISION_NOTIFY_JOB, type BillingDecisionSource, subscriptionRenewalStart } from "@exapay/shared";
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";

import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";
import { BILLING_QUEUE, type BillingQueue } from "../../redis/redis.module.js";
import { AuditService } from "../audit/audit.service.js";
import { SubscriptionsService } from "./subscriptions.service.js";

export type PaymentDecision = { kind: "confirm" } | { kind: "reject"; reason: string };

export type DecisionResult = {
  tenantId: string;
  invoiceId: string;
  // Lunas: akhir periode baru (null bila usaha gratis/pilot — langganan tidak diubah)
  periodEndsAt: Date | null;
};

// Keputusan atas laporan "Saya sudah bayar" (feature 42) — dipakai dashboard super-admin (/admin/billing) dan tautan
// konfirmasi di email (tanpa login). Pemanggil membuka transaksi withTenant(usaha tagihan) dan sudah memastikan
// izinnya: super-admin (flag dari DB) atau token konfirmasi yang dipakai di transaksi yang sama — trigger
// guard_billing_invoice & guard_tenant_subscription memeriksa ulang di database.
//   confirm → tagihan lunas; langganan aktif +1 bulan kalender dari akhir trial/periode sebelumnya (atau dari sekarang
//             bila sudah baca-saja) → usaha baca-saja langsung bisa dipakai lagi
//   reject  → tagihan kembali open (QR & nominal sama) + alasan untuk owner; klaim & bukti dilepas (file bukti tetap
//             tersimpan, key-nya dicatat di audit)
@Injectable()
export class BillingDecisionsService {
  private readonly logger = new Logger(BillingDecisionsService.name);

  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
    @Inject(BILLING_QUEUE) private readonly queue: BillingQueue,
  ) {}

  async decide(
    tx: Transaction,
    ctx: TenantContext,
    invoiceId: string,
    decision: PaymentDecision,
    source: BillingDecisionSource,
    now: Date = new Date(),
  ): Promise<DecisionResult> {
    const [invoice] = await tx
      .select({
        status: billingInvoices.status,
        number: billingInvoices.number,
        totalAmount: billingInvoices.totalAmount,
        claimedAt: billingInvoices.claimedAt,
        proofKey: billingInvoices.proofKey,
      })
      .from(billingInvoices)
      .where(eq(billingInvoices.id, invoiceId))
      .for("update");
    if (!invoice) throw new NotFoundException("Tagihan tidak ditemukan");
    if (invoice.status !== "awaiting_confirmation") throw new ConflictException("Tagihan ini sudah diputuskan atau tidak sedang menunggu konfirmasi");
    const decidedBy = { decidedByUserId: ctx.userId, decisionSource: source };

    if (decision.kind === "reject") {
      await tx
        .update(billingInvoices)
        .set({
          status: "open",
          claimedAt: null,
          claimedByUserId: null,
          proofKey: null,
          proofName: null,
          proofType: null,
          proofSize: null,
          rejectionReason: decision.reason,
          rejectedAt: now,
          ...decidedBy,
        })
        .where(eq(billingInvoices.id, invoiceId));
      await this.audit.record(tx, ctx, {
        entity: "billing_invoice",
        entityId: invoiceId,
        action: "reject_payment",
        before: { status: invoice.status, claimedAt: invoice.claimedAt?.toISOString() ?? null, proofKey: invoice.proofKey },
        after: { status: "open", reason: decision.reason, source },
      });
      return { tenantId: ctx.tenantId, invoiceId, periodEndsAt: null };
    }

    const row = await this.subscriptions.rowOf(tx, ctx, true);
    if (!row) throw new NotFoundException("Data langganan usaha ini tidak ditemukan");
    let periodEndsAt: Date | null = null;
    // Usaha gratis/pilot (diubah super-admin setelah tagihan terbit): tagihan tetap dicatat lunas, langganan tidak diubah
    if (row.status !== "complimentary") {
      const state = await this.subscriptions.stateFrom(tx, row, now);
      periodEndsAt = addSubscriptionMonth(subscriptionRenewalStart(state, now));
      await tx.update(tenantSubscriptions).set({ status: "active", currentPeriodEndsAt: periodEndsAt }).where(eq(tenantSubscriptions.tenantId, ctx.tenantId));
      await this.audit.record(tx, ctx, {
        entity: "subscription",
        entityId: ctx.tenantId,
        action: "renew",
        before: { status: state.status, endsAt: state.endsAt?.toISOString() ?? null },
        after: { status: "active", currentPeriodEndsAt: periodEndsAt.toISOString(), invoice: invoice.number },
      });
    }
    await tx.update(billingInvoices).set({ status: "paid", paidAt: now, ...decidedBy }).where(eq(billingInvoices.id, invoiceId));
    await this.audit.record(tx, ctx, {
      entity: "billing_invoice",
      entityId: invoiceId,
      action: "confirm_payment",
      before: { status: invoice.status },
      after: { status: "paid", number: invoice.number, totalAmount: invoice.totalAmount, source },
    });
    return { tenantId: ctx.tenantId, invoiceId, periodEndsAt };
  }

  // Setelah commit: email kuitansi / penolakan ke owner (worker). Gagal enqueue tidak membatalkan keputusan.
  async notifyOwner(result: DecisionResult): Promise<void> {
    try {
      await this.queue.add(
        BILLING_DECISION_NOTIFY_JOB,
        { tenantId: result.tenantId, invoiceId: result.invoiceId },
        { jobId: `billing-decision_${result.invoiceId}_${Date.now()}` },
      );
    } catch (error: unknown) {
      this.logger.error(`[billing/decision] gagal enqueue email ke owner ${result.invoiceId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
