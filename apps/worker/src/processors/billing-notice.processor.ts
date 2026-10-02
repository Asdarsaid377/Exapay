import { type Database, memberships, subscriptionNotices, type TenantContext, tenants, tenantSubscriptions, users, withTenant } from "@exapay/db";
import {
  BILLING_CLAIM_NOTIFY_JOB,
  BILLING_DECISION_NOTIFY_JOB,
  BILLING_INVOICE_JOB,
  BILLING_NOTICE_JOB,
  BILLING_NOTICE_SCAN_JOB,
  BILLING_QUEUE_NAME,
  billingClaimNotifyJobDataSchema,
  type BillingNoticeJobData,
  billingNoticeJobDataSchema,
  SUBSCRIPTION_TIME_ZONE,
  subscriptionDaysUntil,
  subscriptionNoticeAt,
  type SubscriptionNoticeKind,
  type SubscriptionState,
  subscriptionStateAt,
  type SubscriptionStatus,
} from "@exapay/shared";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, Queue, UnrecoverableError, Worker } from "bullmq";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { Redis } from "ioredis";

import type { Env } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";
import { type EmailMessage, Mailer } from "../email/mailer.js";
import { BillingInvoices, priceAt } from "./billing-invoices.js";

const SCHEDULER_ID = "billing-notice-daily";
const NOTICE_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const LONG_DATE = new Intl.DateTimeFormat("id-ID", { timeZone: SUBSCRIPTION_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });

type NoticeContext = {
  tenantName: string;
  baseStatus: SubscriptionStatus;
  state: SubscriptionState;
  now: Date;
};

// Pengingat langganan (feature 40) — antrean "billing":
// - billing-notice-scan (job scheduler harian, default 07:00 WIB): id usaha aktif lewat compliance_active_tenant_ids()
//   (SECURITY DEFINER migration 0028, hanya id) → satu job billing-notice per usaha.
// - billing-notice: di bawah RLS usaha itu, hitung status efektif + tahap pengingat (fungsi murni yang sama dengan
//   banner API). Tahap belum tercatat di subscription_notices → baris dicatat lalu email dikirim ke owner terverifikasi
//   DI TRANSAKSI YANG SAMA: email gagal → rollback → dicoba ulang; job paralel menunggu index unik lalu dilewati.
//   Hanya tahap paling mendesak yang dikirim (worker mati beberapa hari tidak mengirim pengingat yang sudah basi).
// Feature 41 — satu Worker untuk seluruh antrean "billing" (dua Worker di antrean yang sama saling merebut job):
// - billing-invoice (dari scan yang sama): terbitkan/kedaluwarsakan tagihan usaha itu → BillingInvoices.issue
// - billing-claim-notify (dari API saat owner menekan "Saya sudah bayar") → BillingInvoices.notifyClaim
// - billing-decision-notify (feature 42, setelah konfirmasi/tolak) → BillingInvoices.notifyDecision
@Injectable()
export class BillingNoticeProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BillingNoticeProcessor.name);
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
    private readonly invoices: BillingInvoices,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.queue = new Queue(BILLING_QUEUE_NAME, { connection: this.connection });
    const pattern = this.config.get("BILLING_NOTICE_CRON", { infer: true });
    const tz = this.config.get("BILLING_NOTICE_CRON_TZ", { infer: true });
    await this.queue.upsertJobScheduler(SCHEDULER_ID, { pattern, tz }, { name: BILLING_NOTICE_SCAN_JOB, data: {}, opts: { removeOnComplete: 30, removeOnFail: 30 } });
    this.worker = new Worker(BILLING_QUEUE_NAME, (job) => this.process(job), { connection: this.connection, concurrency: 2 });
    this.worker.on("failed", (job, error) => this.logger.warn(`[billing/${job?.name ?? "?"}] job ${job?.id ?? "?"} gagal: ${error.message}`));
    this.logger.log(`Memproses antrean "${BILLING_QUEUE_NAME}" — pemindaian pengingat langganan "${pattern}" (${tz})`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async process(job: Job): Promise<void> {
    if (job.name === BILLING_NOTICE_SCAN_JOB) return this.scan(job);
    if (job.name === BILLING_NOTICE_JOB) {
      const data = billingNoticeJobDataSchema.safeParse(job.data);
      if (!data.success) throw new UnrecoverableError("payload job tidak valid");
      return this.notify(data.data);
    }
    if (job.name === BILLING_INVOICE_JOB) {
      const data = billingNoticeJobDataSchema.safeParse(job.data);
      if (!data.success) throw new UnrecoverableError("payload job tidak valid");
      return this.invoices.issue(data.data);
    }
    if (job.name === BILLING_CLAIM_NOTIFY_JOB) {
      const data = billingClaimNotifyJobDataSchema.safeParse(job.data);
      if (!data.success) throw new UnrecoverableError("payload job tidak valid");
      return this.invoices.notifyClaim(data.data);
    }
    if (job.name === BILLING_DECISION_NOTIFY_JOB) {
      const data = billingClaimNotifyJobDataSchema.safeParse(job.data);
      if (!data.success) throw new UnrecoverableError("payload job tidak valid");
      return this.invoices.notifyDecision(data.data);
    }
    throw new UnrecoverableError(`job tidak dikenal: ${job.name}`);
  }

  private async scan(job: Job): Promise<void> {
    if (!this.queue) throw new Error("antrean belum siap");
    // Lintas tenant terdokumentasi (migration 0028): fungsi definer hanya mengembalikan id usaha aktif
    const result = await this.db.execute<{ id: string }>(sql`SELECT id FROM public.compliance_active_tenant_ids() AS id`);
    const scanId = (job.id ?? "manual").replaceAll(":", "-");
    for (const row of result.rows) {
      const data: BillingNoticeJobData = { tenantId: row.id };
      // Tagihan dulu: email tagihan (H-7) dan pengingat trial H-7 sama-sama berangkat hari itu
      await this.queue.add(BILLING_INVOICE_JOB, data, { ...NOTICE_JOB_OPTIONS, jobId: `billing-invoice_${row.id}_${scanId}` });
      await this.queue.add(BILLING_NOTICE_JOB, data, { ...NOTICE_JOB_OPTIONS, jobId: `billing-notice_${row.id}_${scanId}` });
    }
    this.logger.log(`[billing/scan] ${result.rows.length} usaha dijadwalkan`);
  }

  // Publik agar bisa diuji dengan tanggal digeser (apps/api/test/billing.e2e.test.ts)
  async notify(data: BillingNoticeJobData, now: Date = new Date()): Promise<void> {
    const ctx: TenantContext = { tenantId: data.tenantId, userId: null };
    const outcome = await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({
          tenantName: tenants.name,
          status: tenantSubscriptions.status,
          trialEndsAt: tenantSubscriptions.trialEndsAt,
          currentPeriodEndsAt: tenantSubscriptions.currentPeriodEndsAt,
        })
        .from(tenantSubscriptions)
        .innerJoin(tenants, eq(tenants.id, tenantSubscriptions.tenantId))
        .where(eq(tenantSubscriptions.tenantId, ctx.tenantId));
      if (!row || row.status === "complimentary") return "none";

      const state = subscriptionStateAt(row, (await priceAt(tx, now)).graceDays, now);
      const kind = subscriptionNoticeAt(state, now);
      if (!kind || !state.endsAt) return "none";

      const recipients = await tx
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.role, "owner"), isNotNull(users.emailVerifiedAt)));
      if (recipients.length === 0) return `${kind}: tanpa owner terverifikasi`;

      // Klaim tahap ini; sudah ada (terkirim sebelumnya / job paralel) → lewati
      const claimed = await tx
        .insert(subscriptionNotices)
        .values({ tenantId: ctx.tenantId, kind, periodEndsAt: state.endsAt, recipientCount: recipients.length })
        .onConflictDoNothing()
        .returning({ id: subscriptionNotices.id });
      if (claimed.length === 0) return "none";

      const message = this.composeEmail(kind, { tenantName: row.tenantName, baseStatus: row.status, state, now });
      await this.mailer.send({ to: recipients.map((recipient) => recipient.email).join(", "), ...message });
      return `${kind}: email ke ${recipients.length} owner`;
    });
    if (outcome !== "none") this.logger.log(`[billing/notice] usaha ${data.tenantId}: ${outcome}`);
  }

  private composeEmail(kind: SubscriptionNoticeKind, notice: NoticeContext): Pick<EmailMessage, "subject" | "text"> {
    const link = `${this.config.get("APP_WEB_URL", { infer: true })}/settings/billing`;
    const { tenantName, state, now } = notice;
    const endsAt = state.endsAt ? LONG_DATE.format(state.endsAt) : "-";
    const graceEndsAt = state.graceEndsAt ? LONG_DATE.format(state.graceEndsAt) : "-";
    const period = notice.baseStatus === "trialing" ? "Masa trial" : "Langganan";

    if (kind === "read_only") {
      return {
        subject: `${tenantName} sekarang dalam mode baca-saja`,
        text: [
          `${period} Exapay untuk ${tenantName} telah berakhir dan masa tenggang selesai pada ${graceEndsAt}.`,
          "",
          "Usaha Anda sekarang dalam mode baca-saja: data tetap aman dan masih bisa dilihat serta diekspor, tetapi absen, log tugas, dan perubahan data tidak bisa dilakukan sampai langganan diaktifkan kembali.",
          "",
          "Lihat status langganan:",
          link,
        ].join("\n"),
      };
    }
    if (kind === "grace_started") {
      return {
        subject: `${period} ${tenantName} telah berakhir — tenggang sampai ${graceEndsAt}`,
        text: [
          `${period} Exapay untuk ${tenantName} berakhir pada ${endsAt}.`,
          "",
          `Usaha Anda masih bisa dipakai seperti biasa selama masa tenggang sampai ${graceEndsAt}. Setelah itu usaha masuk mode baca-saja (data tetap aman, tidak bisa diubah) sampai langganan diaktifkan.`,
          "",
          "Lihat status & estimasi tagihan:",
          link,
        ].join("\n"),
      };
    }
    const days = state.endsAt ? subscriptionDaysUntil(state.endsAt, now) : 0;
    const when = days <= 0 ? "hari ini" : days === 1 ? "besok" : `dalam ${days} hari`;
    return {
      subject: `Trial Exapay ${tenantName} berakhir ${when}`,
      text: [
        `Masa trial gratis Exapay untuk ${tenantName} berakhir ${when} (${endsAt}).`,
        "",
        `Setelah trial berakhir ada masa tenggang sampai ${graceEndsAt}; lewat dari itu usaha masuk mode baca-saja sampai langganan diaktifkan. Data tidak pernah dihapus.`,
        "",
        "Lihat status trial & estimasi tagihan bulanan:",
        link,
      ].join("\n"),
    };
  }
}
