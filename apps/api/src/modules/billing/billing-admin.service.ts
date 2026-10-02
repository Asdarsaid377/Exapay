import { billingInvoices, billingPrices, tenantSubscriptions } from "@exapay/db";
import {
  type AdminBillingOverview,
  type AdminBillingQueueItem,
  type AdminTenantSubscription,
  type BillingPriceInput,
  type BillingPriceVersion,
  type ExtendTrialInput,
  subscriptionDate,
  type TenantPriceOverrideInput,
} from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant, withUser } from "../../database/tenant-transaction.js";
import type { AttachmentFile } from "../attendance/leave-requests.service.js";
import { AuditService } from "../audit/audit.service.js";
import { FileStorage } from "../storage/file-storage.js";
import { BillingDecisionsService, type PaymentDecision } from "./billing-decisions.service.js";
import { effectiveStatus, summaryOf } from "./billing.service.js";
import { SubscriptionsService } from "./subscriptions.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Baris admin_billing_queue() (migration 0033) — db.execute: timestamptz sebagai string, numeric sebagai string
type QueueRow = {
  invoice_id: string;
  tenant_id: string;
  tenant_name: string;
  number: string;
  total_amount: string;
  unique_code: number;
  billed_employees: number;
  claimed_at: string;
  due_at: string;
  has_proof: boolean;
};

// Panel super-admin tagihan & langganan (feature 42). Baca lintas usaha hanya lewat admin_billing_queue() (definer,
// kolom tingkat platform); tulis memakai withTenant(usaha target, super-admin) + cek flag super-admin dari DB
// (klaim JWT bisa basi). Super-admin tetap tidak melihat data karyawan/gaji — hanya jumlah karyawan yang ditagih.
@Injectable()
export class BillingAdminService {
  private readonly logger = new Logger(BillingAdminService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly subscriptions: SubscriptionsService,
    private readonly decisions: BillingDecisionsService,
    private readonly storage: FileStorage,
    private readonly audit: AuditService,
  ) {}

  async overview(user: AuthUser, now: Date = new Date()): Promise<AdminBillingOverview> {
    return withUser(this.db, user.userId, async (tx) => {
      await assertSuperAdmin(tx);
      const { rows } = await tx.execute<QueueRow>(sql`SELECT * FROM public.admin_billing_queue()`);
      const queue: AdminBillingQueueItem[] = rows.map((row) => ({
        invoiceId: row.invoice_id,
        tenantId: row.tenant_id,
        tenantName: row.tenant_name,
        number: row.number,
        totalAmount: row.total_amount,
        uniqueCode: row.unique_code,
        billedEmployees: row.billed_employees,
        claimedAt: new Date(row.claimed_at).toISOString(),
        dueAt: new Date(row.due_at).toISOString(),
        hasProof: row.has_proof,
      }));
      return { queue, prices: await priceVersions(tx), today: subscriptionDate(now) };
    });
  }

  async decide(user: AuthUser, tenantId: string, invoiceId: string, decision: PaymentDecision): Promise<void> {
    const ctx: TenantContext = { tenantId, userId: user.userId };
    const result = await withTenant(this.db, ctx, async (tx) => {
      await assertSuperAdmin(tx);
      return this.decisions.decide(tx, ctx, invoiceId, decision, "dashboard");
    });
    await this.decisions.notifyOwner(result);
  }

  async proof(user: AuthUser, tenantId: string, invoiceId: string): Promise<AttachmentFile> {
    const ctx: TenantContext = { tenantId, userId: user.userId };
    const found = await withTenant(this.db, ctx, async (tx) => {
      await assertSuperAdmin(tx);
      const [row] = await tx
        .select({ key: billingInvoices.proofKey, name: billingInvoices.proofName, contentType: billingInvoices.proofType })
        .from(billingInvoices)
        .where(eq(billingInvoices.id, invoiceId));
      return row;
    });
    if (!found?.key || !found.name || !found.contentType) throw new NotFoundException("Bukti bayar tidak ditemukan");
    try {
      return { buffer: await this.storage.get(found.key), name: found.name, contentType: found.contentType };
    } catch (error: unknown) {
      this.logger.error(`[billing-admin/proof] ${invoiceId}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Bukti bayar tidak dapat dibuka saat ini. Coba lagi nanti.");
    }
  }

  // Versi harga platform baru, berlaku paling cepat besok (zona platform). Versi terjadwal yang mulai pada/sesudah tanggal
  // itu digantikan; versi berjalan ditutup sehari sebelumnya. Tagihan yang sudah terbit memakai snapshot — tidak berubah.
  // Riwayat = versi itu sendiri (tidak pernah ditimpa); audit_logs khusus data usaha sehingga tidak dipakai di sini.
  async addPrice(user: AuthUser, input: BillingPriceInput, now: Date = new Date()): Promise<BillingPriceVersion[]> {
    const today = subscriptionDate(now);
    if (input.effectiveFrom <= today) throw new BadRequestException("Tanggal berlaku paling cepat besok — harga yang sudah berlaku tidak diubah");
    const dayBefore = new Date(Date.parse(`${input.effectiveFrom}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

    return withUser(this.db, user.userId, async (tx) => {
      await assertSuperAdmin(tx);
      // Kunci tabel versi: dua super-admin menyimpan bersamaan tidak saling menimpa
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('billing_prices'))`);
      await tx.delete(billingPrices).where(gte(billingPrices.effectiveFrom, input.effectiveFrom));
      await tx
        .update(billingPrices)
        .set({ effectiveTo: dayBefore })
        .where(and(lt(billingPrices.effectiveFrom, input.effectiveFrom), or(isNull(billingPrices.effectiveTo), gte(billingPrices.effectiveTo, input.effectiveFrom))));
      await tx.insert(billingPrices).values({
        pricePerEmployee: input.pricePerEmployee,
        minBilledEmployees: input.minBilledEmployees,
        trialDays: input.trialDays,
        graceDays: input.graceDays,
        effectiveFrom: input.effectiveFrom,
        note: input.note?.trim() || null,
      });
      this.logger.log(`[billing-admin/price] super-admin ${user.userId} menjadwalkan harga ${input.pricePerEmployee} mulai ${input.effectiveFrom}`);
      return priceVersions(tx);
    });
  }

  async tenantSubscription(user: AuthUser, tenantId: string, now: Date = new Date()): Promise<AdminTenantSubscription> {
    const ctx: TenantContext = { tenantId, userId: user.userId };
    return withTenant(this.db, ctx, async (tx) => {
      await assertSuperAdmin(tx);
      const row = await this.subscriptions.rowOf(tx, ctx);
      if (!row) throw new NotFoundException("Data langganan usaha ini tidak ditemukan");
      const state = await this.subscriptions.stateFrom(tx, row, now);
      const platform = await this.subscriptions.priceAt(tx, now);
      const [live] = await tx
        .select({ id: billingInvoices.id, number: billingInvoices.number, status: billingInvoices.status, totalAmount: billingInvoices.totalAmount, dueAt: billingInvoices.dueAt })
        .from(billingInvoices)
        .where(inArray(billingInvoices.status, ["open", "awaiting_confirmation"]))
        .limit(1);
      return {
        subscription: summaryOf(row, state, now),
        pricePerEmployeeOverride: row.pricePerEmployeeOverride,
        minBilledEmployeesOverride: row.minBilledEmployeesOverride,
        platformPrice: { pricePerEmployee: platform.pricePerEmployee, minBilledEmployees: platform.minBilledEmployees, trialDays: platform.trialDays },
        liveInvoice: live
          ? { id: live.id, number: live.number, status: effectiveStatus(live.status, live.dueAt, now), totalAmount: live.totalAmount, dueAt: live.dueAt.toISOString() }
          : null,
      };
    });
  }

  // Beri / perpanjang trial: dari akhir trial bila masih berjalan, selain itu dari sekarang. Juga mengubah usaha gratis
  // (pilot) menjadi trial. Langganan berbayar tidak bisa dijadikan trial.
  async extendTrial(user: AuthUser, tenantId: string, input: ExtendTrialInput, now: Date = new Date()): Promise<void> {
    await this.mutate(user, tenantId, async (tx, ctx) => {
      const row = await this.subscriptions.rowOf(tx, ctx, true);
      if (!row) throw new NotFoundException("Data langganan usaha ini tidak ditemukan");
      if (row.status === "active") throw new ConflictException("Usaha ini sudah berlangganan berbayar — trial tidak bisa diberikan");
      const base = row.status === "trialing" && row.trialEndsAt && row.trialEndsAt > now ? row.trialEndsAt : now;
      const trialEndsAt = new Date(base.getTime() + input.days * DAY_MS);
      await tx.update(tenantSubscriptions).set({ status: "trialing", trialEndsAt }).where(eq(tenantSubscriptions.tenantId, tenantId));
      await this.audit.record(tx, ctx, {
        entity: "subscription",
        entityId: tenantId,
        action: "extend_trial",
        before: { status: row.status, trialEndsAt: row.trialEndsAt?.toISOString() ?? null },
        after: { status: "trialing", trialEndsAt: trialEndsAt.toISOString(), days: input.days },
      });
    });
  }

  // Gratis (pilot): tidak pernah ditagih/terkunci. Tagihan open dibatalkan (expired); yang menunggu konfirmasi tetap
  // diputuskan seperti biasa.
  async setComplimentary(user: AuthUser, tenantId: string): Promise<void> {
    await this.mutate(user, tenantId, async (tx, ctx) => {
      const row = await this.subscriptions.rowOf(tx, ctx, true);
      if (!row) throw new NotFoundException("Data langganan usaha ini tidak ditemukan");
      if (row.status === "complimentary") return;
      await tx.update(tenantSubscriptions).set({ status: "complimentary" }).where(eq(tenantSubscriptions.tenantId, tenantId));
      const voided = await tx
        .update(billingInvoices)
        .set({ status: "expired" })
        .where(eq(billingInvoices.status, "open"))
        .returning({ number: billingInvoices.number });
      await this.audit.record(tx, ctx, {
        entity: "subscription",
        entityId: tenantId,
        action: "set_complimentary",
        before: { status: row.status },
        after: { status: "complimentary", voidedInvoices: voided.map((invoice) => invoice.number) },
      });
    });
  }

  async setPriceOverride(user: AuthUser, tenantId: string, input: TenantPriceOverrideInput): Promise<void> {
    await this.mutate(user, tenantId, async (tx, ctx) => {
      const row = await this.subscriptions.rowOf(tx, ctx, true);
      if (!row) throw new NotFoundException("Data langganan usaha ini tidak ditemukan");
      await tx
        .update(tenantSubscriptions)
        .set({ pricePerEmployeeOverride: input.pricePerEmployee, minBilledEmployeesOverride: input.minBilledEmployees })
        .where(eq(tenantSubscriptions.tenantId, tenantId));
      await this.audit.record(tx, ctx, {
        entity: "subscription",
        entityId: tenantId,
        action: "set_price_override",
        before: { pricePerEmployee: row.pricePerEmployeeOverride, minBilledEmployees: row.minBilledEmployeesOverride },
        after: { pricePerEmployee: input.pricePerEmployee, minBilledEmployees: input.minBilledEmployees },
      });
    });
  }

  private async mutate(user: AuthUser, tenantId: string, fn: (tx: Transaction, ctx: TenantContext) => Promise<void>): Promise<void> {
    const ctx: TenantContext = { tenantId, userId: user.userId };
    await withTenant(this.db, ctx, async (tx) => {
      await assertSuperAdmin(tx);
      await fn(tx, ctx);
    });
  }
}

async function assertSuperAdmin(tx: Transaction): Promise<void> {
  const { rows } = await tx.execute<{ ok: boolean }>(sql`select public.current_app_is_super_admin() as ok`);
  if (!rows[0]?.ok) throw new ForbiddenException("Anda tidak memiliki akses ke fitur ini");
}

async function priceVersions(tx: Transaction): Promise<BillingPriceVersion[]> {
  return tx
    .select({
      id: billingPrices.id,
      pricePerEmployee: billingPrices.pricePerEmployee,
      minBilledEmployees: billingPrices.minBilledEmployees,
      trialDays: billingPrices.trialDays,
      graceDays: billingPrices.graceDays,
      effectiveFrom: billingPrices.effectiveFrom,
      effectiveTo: billingPrices.effectiveTo,
      note: billingPrices.note,
    })
    .from(billingPrices)
    .orderBy(desc(billingPrices.effectiveFrom));
}
