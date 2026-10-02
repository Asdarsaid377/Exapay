import { createHash, randomBytes, randomInt } from "node:crypto";

import { billingConfirmationTokens, billingInvoices, billingPrices, type Database, employees, memberships, type TenantContext, tenants, tenantSubscriptions, type Transaction, users, withTenant } from "@exapay/db";
import {
  BILLING_CONFIRMATION_TOKEN_DAYS,
  BILLING_UNIQUE_CODE_MAX,
  BILLING_UNIQUE_CODE_MIN,
  type BillingClaimNotifyJobData,
  billingInvoiceDueAt,
  billingInvoiceNeededAt,
  type BillingNoticeJobData,
  formatRupiah,
  SUBSCRIPTION_TIME_ZONE,
  subscriptionDate,
  subscriptionStateAt,
} from "@exapay/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Decimal } from "decimal.js";
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import type { Env } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";
import { Mailer } from "../email/mailer.js";

// Kode unik acak; bentrok (nominal sama dengan tagihan berjalan usaha lain) → coba kode lain
const MAX_CODE_ATTEMPTS = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
// Nomor tagihan: EXA-YYMM-XXXXXX (tanpa 0/O/1/I agar mudah dibaca & didiktekan)
const NUMBER_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LIVE_STATUSES = ["open", "awaiting_confirmation"] as const;

const LONG_DATE = new Intl.DateTimeFormat("id-ID", { timeZone: SUBSCRIPTION_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const DATE_TIME = new Intl.DateTimeFormat("id-ID", { timeZone: SUBSCRIPTION_TIME_ZONE, dateStyle: "long", timeStyle: "short" });

type Price = { pricePerEmployee: string; minBilledEmployees: number; graceDays: number };

// Tagihan langganan (feature 41), dipanggil BillingNoticeProcessor (antrean "billing"):
// - issue: satu usaha, di bawah RLS usaha itu. Tagihan open yang lewat batas bayar → expired. Bila trial/periode
//   berakhir ≤ 7 hari lagi atau sudah lewat dan belum ada tagihan berjalan → terbitkan tagihan baru (snapshot harga
//   berlaku pada awal periode + jumlah karyawan aktif + kode unik 1–999) dan email ke owner terverifikasi DI TRANSAKSI
//   YANG SAMA: email gagal → rollback → dicoba ulang. Index unik parsial menjaga satu tagihan berjalan per usaha dan
//   nominal unik di antara tagihan berjalan seluruh platform.
// - notifyClaim: email ke pemilik platform (BILLING_NOTIFY_EMAIL) saat owner menekan "Saya sudah bayar".
@Injectable()
export class BillingInvoices {
  private readonly logger = new Logger(BillingInvoices.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Publik agar bisa diuji dengan tanggal digeser (apps/worker/test/billing-invoices.test.ts)
  async issue(data: BillingNoticeJobData, now: Date = new Date()): Promise<void> {
    const ctx: TenantContext = { tenantId: data.tenantId, userId: null };
    const outcome = await withTenant(this.db, ctx, async (tx) => {
      // Batas bayar dibandingkan dengan jam database — sama dengan trigger guard_billing_invoice
      const expired = await tx
        .update(billingInvoices)
        .set({ status: "expired" })
        .where(and(eq(billingInvoices.status, "open"), sql`${billingInvoices.dueAt} < now()`))
        .returning({ number: billingInvoices.number });

      const [row] = await tx
        .select({
          tenantName: tenants.name,
          status: tenantSubscriptions.status,
          trialEndsAt: tenantSubscriptions.trialEndsAt,
          currentPeriodEndsAt: tenantSubscriptions.currentPeriodEndsAt,
          pricePerEmployeeOverride: tenantSubscriptions.pricePerEmployeeOverride,
          minBilledEmployeesOverride: tenantSubscriptions.minBilledEmployeesOverride,
        })
        .from(tenantSubscriptions)
        .innerJoin(tenants, eq(tenants.id, tenantSubscriptions.tenantId))
        .where(eq(tenantSubscriptions.tenantId, ctx.tenantId));
      const expiredNote = expired.length > 0 ? `${expired.map((invoice) => invoice.number).join(", ")} kedaluwarsa; ` : "";
      if (!row || row.status === "complimentary") return expiredNote || "none";

      const state = subscriptionStateAt(row, (await priceAt(tx, now)).graceDays, now);
      if (!billingInvoiceNeededAt(state, now) || !state.endsAt) return expiredNote || "none";
      if (await hasLiveInvoice(tx)) return expiredNote || "none";

      // Periode yang ditagih mulai di akhir trial/periode; bila sudah lewat (tenggang/baca-saja) → hari ini
      const periodStartAt = state.endsAt > now ? state.endsAt : now;
      // Harga khusus usaha (feature 42, diatur super-admin) menimpa harga platform
      const platformPrice = await priceAt(tx, periodStartAt);
      const price = {
        pricePerEmployee: row.pricePerEmployeeOverride ?? platformPrice.pricePerEmployee,
        minBilledEmployees: row.minBilledEmployeesOverride ?? platformPrice.minBilledEmployees,
      };
      const [counted] = await tx.select({ active: sql<number>`count(*)::int` }).from(employees).where(isNull(employees.endDate));
      const activeEmployees = counted?.active ?? 0;
      const billedEmployees = Math.max(activeEmployees, price.minBilledEmployees);
      const baseAmount = new Decimal(price.pricePerEmployee).times(billedEmployees);

      let invoice: { id: string; number: string; totalAmount: string; uniqueCode: number; dueAt: Date } | undefined;
      for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !invoice; attempt++) {
        const uniqueCode = randomInt(BILLING_UNIQUE_CODE_MIN, BILLING_UNIQUE_CODE_MAX + 1);
        // DO NOTHING untuk semua index unik: nominal sudah dipakai usaha lain, nomor bentrok, atau job paralel usaha ini
        [invoice] = await tx
          .insert(billingInvoices)
          .values({
            tenantId: ctx.tenantId,
            number: invoiceNumber(now),
            periodStart: subscriptionDate(periodStartAt),
            issuedAt: now,
            dueAt: billingInvoiceDueAt(now),
            pricePerEmployee: price.pricePerEmployee,
            minBilledEmployees: price.minBilledEmployees,
            activeEmployees,
            billedEmployees,
            baseAmount: baseAmount.toFixed(2),
            uniqueCode,
            totalAmount: baseAmount.plus(uniqueCode).toFixed(2),
          })
          .onConflictDoNothing()
          .returning({
            id: billingInvoices.id,
            number: billingInvoices.number,
            totalAmount: billingInvoices.totalAmount,
            uniqueCode: billingInvoices.uniqueCode,
            dueAt: billingInvoices.dueAt,
          });
        if (!invoice && (await hasLiveInvoice(tx))) return `${expiredNote}tagihan sudah diterbitkan job lain`;
      }
      if (!invoice) throw new Error(`[billing/invoice] tidak menemukan kode unik bebas setelah ${MAX_CODE_ATTEMPTS} percobaan`);

      const recipients = await tx
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.role, "owner"), isNotNull(users.emailVerifiedAt)));
      if (recipients.length === 0) return `${expiredNote}tagihan ${invoice.number} terbit (tanpa owner terverifikasi)`;

      const link = `${this.config.get("APP_WEB_URL", { infer: true })}/settings/billing`;
      await this.mailer.send({
        to: recipients.map((recipient) => recipient.email).join(", "),
        subject: `Tagihan Exapay ${invoice.number} — ${row.tenantName}`,
        text: [
          `Tagihan langganan Exapay untuk ${row.tenantName} telah terbit.`,
          "",
          `Nomor tagihan: ${invoice.number}`,
          `Periode mulai: ${LONG_DATE.format(periodStartAt)} (1 bulan)`,
          `Rincian: ${billedEmployees} karyawan × ${formatRupiah(price.pricePerEmployee)} = ${formatRupiah(baseAmount.toFixed(2))}`,
          `Kode unik: ${invoice.uniqueCode}`,
          `Total yang harus dibayar (persis): ${formatRupiah(invoice.totalAmount)}`,
          `Bayar sebelum: ${DATE_TIME.format(invoice.dueAt)} WIB`,
          "",
          "Bayar dengan QRIS di halaman langganan, lalu tekan \"Saya sudah bayar\". Pastikan nominal sama persis (termasuk kode unik) agar pembayaran mudah dicocokkan.",
          link,
        ].join("\n"),
      });
      return `${expiredNote}tagihan ${invoice.number} terbit, email ke ${recipients.length} owner`;
    });
    if (outcome !== "none") this.logger.log(`[billing/invoice] usaha ${data.tenantId}: ${outcome}`);
  }

  // Email ke pemilik platform + tautan konfirmasi/tolak tanpa login (feature 42). Token dibuat di transaksi yang sama
  // dengan pengiriman: email gagal → token batal → dicoba ulang dengan token baru.
  async notifyClaim(data: BillingClaimNotifyJobData, now: Date = new Date()): Promise<void> {
    const recipients = this.config.get("BILLING_NOTIFY_EMAIL", { infer: true });
    if (recipients.length === 0) {
      this.logger.warn(`[billing/claim] BILLING_NOTIFY_EMAIL kosong — pemberitahuan tagihan ${data.invoiceId} tidak dikirim`);
      return;
    }
    const ctx: TenantContext = { tenantId: data.tenantId, userId: null };
    const sent = await withTenant(this.db, ctx, async (tx) => {
      const [invoice] = await tx
        .select({
          tenantName: tenants.name,
          number: billingInvoices.number,
          status: billingInvoices.status,
          totalAmount: billingInvoices.totalAmount,
          uniqueCode: billingInvoices.uniqueCode,
          claimedAt: billingInvoices.claimedAt,
          hasProof: sql<boolean>`${billingInvoices.proofKey} IS NOT NULL`,
        })
        .from(billingInvoices)
        .innerJoin(tenants, eq(tenants.id, billingInvoices.tenantId))
        .where(eq(billingInvoices.id, data.invoiceId));
      // Sudah dikonfirmasi/ditolak sebelum job berjalan → tidak perlu diberitahukan lagi
      if (invoice?.status !== "awaiting_confirmation" || !invoice.claimedAt) return null;

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now.getTime() + BILLING_CONFIRMATION_TOKEN_DAYS * DAY_MS);
      await tx.insert(billingConfirmationTokens).values({
        tenantId: ctx.tenantId,
        invoiceId: data.invoiceId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        claimedAt: invoice.claimedAt,
        expiresAt,
      });

      const webUrl = this.config.get("APP_WEB_URL", { infer: true });
      // Tanpa data karyawan: hanya usaha, nomor, nominal (build-plan feature 41)
      await this.mailer.send({
        to: recipients.join(", "),
        subject: `Pembayaran dilaporkan: ${invoice.tenantName} — ${formatRupiah(invoice.totalAmount)}`,
        text: [
          `${invoice.tenantName} melaporkan sudah membayar tagihan langganan Exapay.`,
          "",
          `Usaha: ${invoice.tenantName}`,
          `Nomor tagihan: ${invoice.number}`,
          `Nominal persis: ${formatRupiah(invoice.totalAmount)} (kode unik ${invoice.uniqueCode})`,
          `Dilaporkan: ${DATE_TIME.format(invoice.claimedAt)} WIB`,
          `Bukti bayar: ${invoice.hasProof ? "diunggah" : "tidak ada"}`,
          "",
          "Cocokkan nominal dengan mutasi di aplikasi merchant QRIS, lalu buka tautan ini untuk mengonfirmasi lunas atau menolak (tanpa login):",
          `${webUrl}/payment/confirm/${token}`,
          "",
          `Tautan hanya bisa dipakai sekali dan berlaku sampai ${DATE_TIME.format(expiresAt)} WIB. Jangan teruskan email ini ke orang lain.`,
          `Bisa juga lewat panel super-admin: ${webUrl}/admin/billing`,
        ].join("\n"),
      });
      return invoice.number;
    });
    if (sent) this.logger.log(`[billing/claim] pemberitahuan ${sent} dikirim ke ${recipients.length} alamat`);
    else this.logger.log(`[billing/claim] tagihan ${data.invoiceId} tidak lagi menunggu konfirmasi — dilewati`);
  }

  // Setelah keputusan pemilik platform (feature 42): kuitansi (lunas) atau pemberitahuan penolakan ke owner terverifikasi
  async notifyDecision(data: BillingClaimNotifyJobData): Promise<void> {
    const ctx: TenantContext = { tenantId: data.tenantId, userId: null };
    const outcome = await withTenant(this.db, ctx, async (tx) => {
      const [invoice] = await tx
        .select({
          tenantName: tenants.name,
          number: billingInvoices.number,
          status: billingInvoices.status,
          totalAmount: billingInvoices.totalAmount,
          paidAt: billingInvoices.paidAt,
          dueAt: billingInvoices.dueAt,
          rejectionReason: billingInvoices.rejectionReason,
          periodEndsAt: tenantSubscriptions.currentPeriodEndsAt,
          subscriptionStatus: tenantSubscriptions.status,
        })
        .from(billingInvoices)
        .innerJoin(tenants, eq(tenants.id, billingInvoices.tenantId))
        .innerJoin(tenantSubscriptions, eq(tenantSubscriptions.tenantId, billingInvoices.tenantId))
        .where(eq(billingInvoices.id, data.invoiceId));
      const paid = invoice?.status === "paid" && invoice.paidAt;
      const rejected = invoice?.status === "open" && invoice.rejectionReason;
      if (!invoice || (!paid && !rejected)) return "keputusan sudah berubah — dilewati";

      const recipients = await tx
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.role, "owner"), isNotNull(users.emailVerifiedAt)));
      if (recipients.length === 0) return "tanpa owner terverifikasi";

      const link = `${this.config.get("APP_WEB_URL", { infer: true })}/settings/billing`;
      const message =
        paid && invoice.paidAt
          ? {
              subject: `Kuitansi pembayaran Exapay ${invoice.number} — ${invoice.tenantName}`,
              text: [
                `Terima kasih. Pembayaran langganan Exapay untuk ${invoice.tenantName} telah kami terima.`,
                "",
                `Nomor tagihan: ${invoice.number}`,
                `Jumlah dibayar: ${formatRupiah(invoice.totalAmount)}`,
                `Dikonfirmasi: ${DATE_TIME.format(invoice.paidAt)} WIB`,
                invoice.subscriptionStatus === "active" && invoice.periodEndsAt
                  ? `Langganan aktif sampai: ${LONG_DATE.format(invoice.periodEndsAt)}`
                  : "Status langganan: gratis (pilot)",
                "",
                "Riwayat tagihan & status langganan:",
                link,
              ].join("\n"),
            }
          : {
              subject: `Pembayaran tagihan ${invoice.number} belum dapat dikonfirmasi — ${invoice.tenantName}`,
              text: [
                `Laporan pembayaran tagihan ${invoice.number} (${formatRupiah(invoice.totalAmount)}) untuk ${invoice.tenantName} belum dapat kami konfirmasi.`,
                "",
                `Alasan: ${invoice.rejectionReason ?? "-"}`,
                "",
                `Tagihan masih bisa dibayar sampai ${DATE_TIME.format(invoice.dueAt)} WIB. Pastikan nominal dibayar persis (termasuk kode unik), lalu laporkan lagi lewat tombol "Saya sudah bayar":`,
                link,
              ].join("\n"),
            };
      await this.mailer.send({ to: recipients.map((recipient) => recipient.email).join(", "), ...message });
      return `${paid ? "kuitansi" : "penolakan"} dikirim ke ${recipients.length} owner`;
    });
    this.logger.log(`[billing/decision] tagihan ${data.invoiceId}: ${outcome}`);
  }
}

async function hasLiveInvoice(tx: Transaction): Promise<boolean> {
  const [live] = await tx.select({ id: billingInvoices.id }).from(billingInvoices).where(inArray(billingInvoices.status, LIVE_STATUSES)).limit(1);
  return live !== undefined;
}

function invoiceNumber(now: Date): string {
  const yymm = subscriptionDate(now).slice(2, 7).replace("-", "");
  const suffix = Array.from({ length: 6 }, () => NUMBER_ALPHABET[randomInt(NUMBER_ALPHABET.length)]).join("");
  return `EXA-${yymm}-${suffix}`;
}

// Harga platform berlaku pada tanggal tsb (pola SubscriptionsService.priceAt di API)
export async function priceAt(tx: Transaction, at: Date): Promise<Price> {
  const date = subscriptionDate(at);
  const [price] = await tx
    .select({ pricePerEmployee: billingPrices.pricePerEmployee, minBilledEmployees: billingPrices.minBilledEmployees, graceDays: billingPrices.graceDays })
    .from(billingPrices)
    .where(and(lte(billingPrices.effectiveFrom, date), or(isNull(billingPrices.effectiveTo), gte(billingPrices.effectiveTo, date))))
    .orderBy(desc(billingPrices.effectiveFrom))
    .limit(1);
  if (!price) throw new Error(`[billing/price] tidak ada harga berlaku pada ${date}`);
  return price;
}
