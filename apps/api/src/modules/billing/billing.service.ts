import { randomUUID } from "node:crypto";

import { billingInvoices, employees, memberships } from "@exapay/db";
import {
  BILLING_CLAIM_NOTIFY_JOB,
  type BillingInvoice,
  type BillingInvoiceStatus,
  type BillingOverview,
  type SubscriptionRow,
  type SubscriptionState,
  type SubscriptionSummary,
  subscriptionDate,
  subscriptionDaysUntil,
  subscriptionNoticeAt,
} from "@exapay/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Decimal } from "decimal.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { BILLING_QUEUE, type BillingQueue } from "../../redis/redis.module.js";
import { ATTACHMENT_EXTENSIONS, detectAttachmentType, safeAttachmentName } from "../attendance/leave-attachment.js";
import type { AttachmentFile, UploadedAttachment } from "../attendance/leave-requests.service.js";
import { AuditService } from "../audit/audit.service.js";
import { FileStorage, tenantFileKey } from "../storage/file-storage.js";
import { PaymentProvider } from "./payment-provider.js";
import { SubscriptionsService } from "./subscriptions.service.js";

// Riwayat di halaman langganan: 24 tagihan terakhir (± 2 tahun)
const HISTORY_LIMIT = 24;
const NOT_FOUND = "Tagihan tidak ditemukan";

const invoiceColumns = {
  id: billingInvoices.id,
  number: billingInvoices.number,
  status: billingInvoices.status,
  periodStart: billingInvoices.periodStart,
  issuedAt: billingInvoices.issuedAt,
  dueAt: billingInvoices.dueAt,
  pricePerEmployee: billingInvoices.pricePerEmployee,
  minBilledEmployees: billingInvoices.minBilledEmployees,
  activeEmployees: billingInvoices.activeEmployees,
  billedEmployees: billingInvoices.billedEmployees,
  baseAmount: billingInvoices.baseAmount,
  uniqueCode: billingInvoices.uniqueCode,
  totalAmount: billingInvoices.totalAmount,
  claimedAt: billingInvoices.claimedAt,
  proofName: billingInvoices.proofName,
  proofType: billingInvoices.proofType,
  proofSize: billingInvoices.proofSize,
};

type InvoiceRow = {
  id: string;
  number: string;
  status: BillingInvoiceStatus;
  periodStart: string;
  issuedAt: Date;
  dueAt: Date;
  pricePerEmployee: string;
  minBilledEmployees: number;
  activeEmployees: number;
  billedEmployees: number;
  baseAmount: string;
  uniqueCode: number;
  totalAmount: string;
  claimedAt: Date | null;
  proofName: string | null;
  proofType: string | null;
  proofSize: number | null;
};

export type InvoiceQrImage = { buffer: Buffer; fileName: string };

// Halaman langganan & banner pengingat (feature 40) + tagihan & pembayaran QRIS (feature 41).
// Tagihan DITERBITKAN worker (billing-invoice); API hanya membaca, menampilkan QR, dan mencatat klaim "Saya sudah bayar".
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly subscriptions: SubscriptionsService,
    private readonly payments: PaymentProvider,
    private readonly storage: FileStorage,
    private readonly audit: AuditService,
    @Inject(BILLING_QUEUE) private readonly queue: BillingQueue,
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
      // Karyawan aktif = belum punya tanggal keluar (sama dengan hitungan "Aktif" di /employees dan snapshot tagihan)
      const [counted] = await tx.select({ active: sql<number>`count(*)::int` }).from(employees).where(isNull(employees.endDate));
      const activeEmployees = counted?.active ?? 0;
      const billedEmployees = Math.max(activeEmployees, price.minBilledEmployees);

      const invoices = (await tx.select(invoiceColumns).from(billingInvoices).orderBy(desc(billingInvoices.issuedAt)).limit(HISTORY_LIMIT)).map(
        (invoice) => toInvoice(invoice, now),
      );

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
        invoice: invoices.find((invoice) => invoice.status === "open" || invoice.status === "awaiting_confirmation") ?? null,
        qrisAvailable: this.payments.available(),
        invoices,
      };
    });
  }

  // QR bernominal persis untuk tagihan yang masih bisa dibayar (open, sebelum batas bayar)
  async qrImage(user: AuthUser, id: string, now: Date = new Date()): Promise<InvoiceQrImage> {
    const ctx = tenantContextOf(user);
    const invoice = await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ number: billingInvoices.number, status: billingInvoices.status, dueAt: billingInvoices.dueAt, totalAmount: billingInvoices.totalAmount })
        .from(billingInvoices)
        .where(eq(billingInvoices.id, id));
      return row;
    });
    if (!invoice) throw new NotFoundException(NOT_FOUND);
    if (effectiveStatus(invoice.status, invoice.dueAt, now) !== "open") throw new ConflictException("Tagihan ini sudah tidak bisa dibayar");
    if (!this.payments.available()) throw new ServiceUnavailableException("Pembayaran QRIS belum tersedia. Hubungi Exapay.");
    try {
      return { buffer: await this.payments.qrImage(invoice.totalAmount), fileName: `QRIS-${invoice.number}.png` };
    } catch (error: unknown) {
      this.logger.error(`[billing/qr] ${id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("QRIS tidak dapat dibuat saat ini. Coba lagi nanti.");
    }
  }

  // "Saya sudah bayar" (+ bukti opsional) → menunggu konfirmasi super-admin; pemberitahuan ke pemilik platform lewat
  // antrean (worker, email BILLING_NOTIFY_EMAIL). Tetap boleh saat baca-saja (@AllowWhenReadOnly di controller).
  async claim(user: AuthUser, id: string, file: UploadedAttachment | null, now: Date = new Date()): Promise<BillingInvoice> {
    const proof = file ? inspectProof(file) : null;
    const ctx = tenantContextOf(user);
    const key = proof ? tenantFileKey(ctx.tenantId, "billing-invoices", id, `${randomUUID()}.${ATTACHMENT_EXTENSIONS[proof.contentType]}`) : null;
    let uploaded = false;

    let invoice: BillingInvoice;
    try {
      invoice = await withTenant(this.db, ctx, async (tx) => {
        await requireOwner(tx, ctx.tenantId, user.userId);
        const [current] = await tx.select(invoiceColumns).from(billingInvoices).where(eq(billingInvoices.id, id)).for("update");
        if (!current) throw new NotFoundException(NOT_FOUND);
        const status = effectiveStatus(current.status, current.dueAt, now);
        if (status === "awaiting_confirmation") throw new ConflictException("Pembayaran tagihan ini sudah dilaporkan dan menunggu konfirmasi");
        if (status !== "open") throw new ConflictException("Tagihan ini sudah tidak bisa dibayar");

        const [updated] = await tx
          .update(billingInvoices)
          .set({
            status: "awaiting_confirmation",
            claimedAt: now,
            claimedByUserId: user.userId,
            proofKey: key,
            proofName: proof?.name ?? null,
            proofType: proof?.contentType ?? null,
            proofSize: proof ? proof.buffer.length : null,
          })
          .where(eq(billingInvoices.id, id))
          .returning(invoiceColumns);
        if (!updated) throw new Error("[billing/claim] update tidak mengembalikan baris");
        await this.audit.record(tx, ctx, {
          entity: "billing_invoice",
          entityId: id,
          action: "claim",
          before: { status: current.status },
          after: { status: updated.status, number: updated.number, totalAmount: updated.totalAmount, proof: proof ? "(diunggah)" : null },
        });

        // Upload terakhir di transaksi: gagal → klaim ikut batal
        if (proof && key) {
          await this.putProof(key, proof);
          uploaded = true;
        }
        return toInvoice(updated, now);
      });
    } catch (error: unknown) {
      if (uploaded && key) await this.removeQuietly(key);
      throw error;
    }

    await this.enqueueClaimNotice(ctx.tenantId, id, now);
    return invoice;
  }

  // Gagal enqueue tidak membatalkan klaim — antrean konfirmasi super-admin (feature 42) tetap menampilkan tagihan ini
  private async enqueueClaimNotice(tenantId: string, invoiceId: string, claimedAt: Date): Promise<void> {
    try {
      await this.queue.add(BILLING_CLAIM_NOTIFY_JOB, { tenantId, invoiceId }, { jobId: `billing-claim_${invoiceId}_${claimedAt.getTime()}` });
    } catch (error: unknown) {
      this.logger.error(`[billing/claim] gagal enqueue pemberitahuan ${invoiceId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async putProof(key: string, proof: AttachmentFile): Promise<void> {
    try {
      await this.storage.put(key, proof.buffer, proof.contentType);
    } catch {
      // Detail sudah di-log FileStorage
      throw new ServiceUnavailableException("Bukti bayar gagal diunggah. Coba lagi, atau kirim tanpa bukti.");
    }
  }

  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch {
      this.logger.warn(`[billing/claim] file yatim tidak terhapus: ${key}`);
    }
  }
}

// Peran dibaca ulang dari DB (klaim JWT bisa basi ≤ 15 menit). Filter tenant wajib: policy own_memberships_select
// juga memperlihatkan membership user di usaha lain.
async function requireOwner(tx: Transaction, tenantId: string, userId: string): Promise<void> {
  const [membership] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.userId, userId), eq(memberships.role, "owner")));
  if (!membership) throw new ForbiddenException("Hanya pemilik usaha yang bisa melaporkan pembayaran");
}

function inspectProof(file: UploadedAttachment): AttachmentFile {
  if (file.size === 0) throw new BadRequestException("File bukti bayar kosong");
  const contentType = detectAttachmentType(file.buffer);
  if (!contentType) throw new BadRequestException("Bukti bayar harus berupa PDF, JPG, atau PNG");
  return { buffer: file.buffer, contentType, name: safeAttachmentName(file.originalname, contentType) };
}

// Tagihan open yang lewat batas bayar tampil "expired" walau worker belum menandainya
function effectiveStatus(status: BillingInvoiceStatus, dueAt: Date, now: Date): BillingInvoiceStatus {
  return status === "open" && now > dueAt ? "expired" : status;
}

function toInvoice(row: InvoiceRow, now: Date): BillingInvoice {
  return {
    id: row.id,
    number: row.number,
    status: effectiveStatus(row.status, row.dueAt, now),
    periodStart: row.periodStart,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    pricePerEmployee: row.pricePerEmployee,
    minBilledEmployees: row.minBilledEmployees,
    activeEmployees: row.activeEmployees,
    billedEmployees: row.billedEmployees,
    baseAmount: row.baseAmount,
    uniqueCode: row.uniqueCode,
    totalAmount: row.totalAmount,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    proof: row.proofName && row.proofType && row.proofSize !== null ? { name: row.proofName, contentType: row.proofType, size: row.proofSize } : null,
  };
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
