import { createHash } from "node:crypto";

import { billingInvoices, tenants, tenantSubscriptions } from "@exapay/db";
import type { PaymentConfirmation } from "@exapay/shared";
import { ConflictException, GoneException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";

import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, withTenant } from "../../database/tenant-transaction.js";
import type { AttachmentFile } from "../attendance/leave-requests.service.js";
import { FileStorage } from "../storage/file-storage.js";
import { BillingDecisionsService, type PaymentDecision } from "./billing-decisions.service.js";

const INVALID = "Tautan konfirmasi tidak valid";

// Baris billing_find_confirmation() — db.execute: timestamptz sebagai string
type TokenRow = { tenant_id: string; invoice_id: string; claimed_at: string; expires_at: string; used_at: string | null };

export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Konfirmasi / tolak pembayaran dari tautan di email pemberitahuan klaim (feature 42, keputusan user) — tanpa login.
// Token = bukti akses ke kotak masuk BILLING_NOTIFY_EMAIL: acak 32 byte, hanya hash yang disimpan, sekali pakai,
// berlaku 7 hari, terikat ke klaim tertentu. Lookup tanpa konteks lewat billing_find_confirmation (definer); keputusan
// memakai billing_consume_confirmation di transaksi keputusan — trigger guard hanya mengizinkan perubahan tagihan &
// langganan usaha itu bila token dipakai di transaksi yang sama. Membaca (lookup) tidak pernah mengubah data.
@Injectable()
export class PaymentConfirmationsService {
  private readonly logger = new Logger(PaymentConfirmationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly decisions: BillingDecisionsService,
    private readonly storage: FileStorage,
  ) {}

  async lookup(token: string, now: Date = new Date()): Promise<PaymentConfirmation> {
    const found = await this.find(token);
    return withTenant(this.db, contextOf(found), async (tx) => {
      const [row] = await tx
        .select({
          tenantName: tenants.name,
          number: billingInvoices.number,
          status: billingInvoices.status,
          totalAmount: billingInvoices.totalAmount,
          uniqueCode: billingInvoices.uniqueCode,
          claimedAt: billingInvoices.claimedAt,
          hasProof: sql<boolean>`${billingInvoices.proofKey} IS NOT NULL`,
          periodEndsAt: tenantSubscriptions.currentPeriodEndsAt,
        })
        .from(billingInvoices)
        .innerJoin(tenants, eq(tenants.id, billingInvoices.tenantId))
        .innerJoin(tenantSubscriptions, eq(tenantSubscriptions.tenantId, billingInvoices.tenantId))
        .where(eq(billingInvoices.id, found.invoice_id));
      if (!row) throw new GoneException(INVALID);

      // Klaim yang dirujuk tautan sudah diputuskan (di sini atau dashboard), atau owner melapor ulang setelah ditolak
      const sameClaim = row.status === "awaiting_confirmation" && row.claimedAt?.getTime() === new Date(found.claimed_at).getTime();
      const state = found.used_at || !sameClaim ? "decided" : new Date(found.expires_at) <= now ? "expired" : "pending";
      return {
        state,
        tenantName: row.tenantName,
        number: row.number,
        totalAmount: row.totalAmount,
        uniqueCode: row.uniqueCode,
        claimedAt: row.claimedAt?.toISOString() ?? null,
        hasProof: row.hasProof,
        invoiceStatus: row.status,
        periodEndsAt: row.status === "paid" ? (row.periodEndsAt?.toISOString() ?? null) : null,
      };
    });
  }

  async decide(token: string, decision: PaymentDecision): Promise<PaymentConfirmation> {
    const found = await this.find(token);
    const ctx = contextOf(found);
    const result = await withTenant(this.db, ctx, async (tx) => {
      const { rows } = await tx.execute<{ invoice_id: string }>(
        sql`SELECT invoice_id FROM public.billing_consume_confirmation(${hashConfirmationToken(token)})`,
      );
      if (rows[0]?.invoice_id !== found.invoice_id) {
        throw new ConflictException("Tautan ini sudah dipakai, kedaluwarsa, atau pembayarannya sudah diputuskan");
      }
      return this.decisions.decide(tx, ctx, found.invoice_id, decision, "email");
    });
    await this.decisions.notifyOwner(result);
    return this.lookup(token);
  }

  async proof(token: string): Promise<AttachmentFile> {
    const found = await this.find(token);
    if (new Date(found.expires_at) <= new Date()) throw new GoneException("Tautan konfirmasi sudah kedaluwarsa");
    const row = await withTenant(this.db, contextOf(found), async (tx) => {
      const [invoice] = await tx
        .select({ key: billingInvoices.proofKey, name: billingInvoices.proofName, contentType: billingInvoices.proofType })
        .from(billingInvoices)
        .where(eq(billingInvoices.id, found.invoice_id));
      return invoice;
    });
    if (!row?.key || !row.name || !row.contentType) throw new NotFoundException("Bukti bayar tidak ditemukan");
    try {
      return { buffer: await this.storage.get(row.key), name: row.name, contentType: row.contentType };
    } catch (error: unknown) {
      this.logger.error(`[payment-confirmations/proof] ${found.invoice_id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Bukti bayar tidak dapat dibuka saat ini. Coba lagi nanti.");
    }
  }

  private async find(token: string): Promise<TokenRow> {
    // Lintas tenant terdokumentasi (migration 0033): definer hanya mengembalikan baris token dengan hash ini
    const { rows } = await this.db.execute<TokenRow>(
      sql`SELECT tenant_id, invoice_id, claimed_at, expires_at, used_at FROM public.billing_find_confirmation(${hashConfirmationToken(token)})`,
    );
    const found = rows[0];
    if (!found) throw new GoneException(INVALID);
    return found;
  }
}

function contextOf(found: TokenRow): TenantContext {
  return { tenantId: found.tenant_id, userId: null };
}
