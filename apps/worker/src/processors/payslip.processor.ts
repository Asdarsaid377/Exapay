import { type Database, payrollRunEmployees, payrollRuns, payslips, type TenantContext, tenants, withTenant } from "@exapay/db";
import {
  PAYSLIP_EMAIL_JOB,
  PAYSLIP_GENERATE_JOB,
  PAYSLIP_QUEUE_NAME,
  type PayslipJobData,
  payrollEmployeeSnapshotSchema,
  payrollRunSnapshotSchema,
  payslipJobDataSchema,
} from "@exapay/shared";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import { Redis } from "ioredis";

import type { Env } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";
import { Mailer } from "../email/mailer.js";
import { buildPayslipContent, formatIdMonth, PayslipContentError } from "../payslips/payslip-content.js";
import { renderPayslipPdf } from "../payslips/payslip-pdf.js";
import { FileStorage, tenantFileKey } from "../storage/file-storage.js";

const GENERATE_ERROR = "Slip gagal dibuat. Coba proses ulang.";
const EMAIL_ERROR = "Email gagal dikirim. Coba kirim ulang.";

// Konsumen antrean "payslips" (feature 31). Tenant dari payload, RLS berlaku (userId null = proses sistem).
// - payslip-generate: klaim slip pending/generating → generating; susun isi dari snapshot final (tidak menghitung ulang);
//   render PDF; simpan ke storage (key tetap per slip → aman diulang); tandai ready. Slip yang sudah ready dilewati.
// - payslip-email: kirim email pemberitahuan berisi tautan /me/payslips (tanpa angka gaji) bila status email masih queued.
// Gagal sementara → dicoba ulang BullMQ (attempts/backoff dari API); percobaan terakhir / gagal permanen → status failed.
@Injectable()
export class PayslipProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PayslipProcessor.name);
  private worker: Worker<PayslipJobData> | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly storage: FileStorage,
    private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.worker = new Worker<PayslipJobData>(PAYSLIP_QUEUE_NAME, (job) => this.process(job), { connection: this.connection, concurrency: 4 });
    this.worker.on("failed", (job, error) => this.logger.warn(`[payslips/${job?.name ?? "?"}] job ${job?.id ?? "?"} gagal: ${error.message}`));
    this.logger.log(`Memproses antrean "${PAYSLIP_QUEUE_NAME}"`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  async process(job: Job<PayslipJobData>): Promise<void> {
    const data = payslipJobDataSchema.safeParse(job.data);
    if (!data.success) throw new UnrecoverableError("payload job tidak valid");
    const ctx: TenantContext = { tenantId: data.data.tenantId, userId: null };
    if (job.name === PAYSLIP_GENERATE_JOB) return this.generate(job, ctx, data.data.payslipId);
    if (job.name === PAYSLIP_EMAIL_JOB) return this.email(job, ctx, data.data.payslipId);
    throw new UnrecoverableError(`job tidak dikenal: ${job.name}`);
  }

  private async generate(job: Job<PayslipJobData>, ctx: TenantContext, payslipId: string): Promise<void> {
    const claimed = await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ status: payslips.status, runId: payslips.runId, employeeId: payslips.employeeId })
        .from(payslips)
        .where(eq(payslips.id, payslipId))
        .for("update");
      if (!row || (row.status !== "pending" && row.status !== "generating")) return null;
      await tx
        .update(payslips)
        .set({ status: "generating", error: null, attempts: sql`${payslips.attempts} + 1` })
        .where(eq(payslips.id, payslipId));
      return row;
    });
    if (claimed === null) {
      this.logger.log(`[payslips/generate] slip ${payslipId} sudah selesai/gagal — dilewati`);
      return;
    }

    let pdf: Buffer;
    let key: string;
    try {
      const source = await withTenant(this.db, ctx, async (tx) => {
        const [employee] = await tx
          .select({ snapshot: payrollRunEmployees.snapshot })
          .from(payrollRunEmployees)
          .where(and(eq(payrollRunEmployees.runId, claimed.runId), eq(payrollRunEmployees.employeeId, claimed.employeeId)));
        const [run] = await tx
          .select({ periodMonth: payrollRuns.periodMonth, periodStart: payrollRuns.periodStart, periodEnd: payrollRuns.periodEnd, snapshot: payrollRuns.snapshot })
          .from(payrollRuns)
          .where(eq(payrollRuns.id, claimed.runId));
        const [tenant] = await tx.select({ name: tenants.name, address: tenants.address }).from(tenants).where(eq(tenants.id, ctx.tenantId));
        return { employee, run, tenant };
      });
      const { employee, run, tenant } = source;
      if (!employee || !run || !tenant || !run.periodStart || !run.periodEnd) throw new PayslipContentError("data payroll final tidak lengkap");
      const runSnapshot = payrollRunSnapshotSchema.parse(run.snapshot);
      const month = run.periodMonth.slice(0, 7);
      const content = buildPayslipContent({
        company: { name: tenant.name, address: tenant.address },
        period: { month, periodStart: run.periodStart, periodEnd: run.periodEnd, payDate: runSnapshot.payDate },
        employee: payrollEmployeeSnapshotSchema.parse(employee.snapshot),
        generatedOn: localDate(new Date(), runSnapshot.inputs.timeZone),
      });
      pdf = await renderPayslipPdf(content, { title: `Slip gaji ${formatIdMonth(month)}`, author: tenant.name });
      key = tenantFileKey(ctx.tenantId, "payslips", claimed.runId, `${payslipId}.pdf`);
      await this.storage.put(key, pdf, "application/pdf");
    } catch (error: unknown) {
      // Data tidak valid tidak akan sembuh dengan dicoba ulang
      const permanent = error instanceof PayslipContentError || (error instanceof Error && error.name === "ZodError");
      const lastAttempt = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(`[payslips/generate] slip ${payslipId} percobaan ${job.attemptsMade + 1}: ${error instanceof Error ? error.message : String(error)}`);
      if (!lastAttempt) throw error;
      await withTenant(this.db, ctx, async (tx) => {
        await tx
          .update(payslips)
          .set({ status: "failed", error: GENERATE_ERROR })
          .where(and(eq(payslips.id, payslipId), eq(payslips.status, "generating")));
      });
      throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
    }

    await withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(payslips)
        .set({ status: "ready", fileKey: key, fileSize: pdf.length, generatedAt: sql`now()`, error: null })
        .where(and(eq(payslips.id, payslipId), eq(payslips.status, "generating")));
    });
    this.logger.log(`[payslips/generate] slip ${payslipId} siap (${pdf.length} byte)`);
  }

  private async email(job: Job<PayslipJobData>, ctx: TenantContext, payslipId: string): Promise<void> {
    const claimed = await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({
          emailStatus: payslips.emailStatus,
          emailTo: payslips.emailTo,
          fullName: payrollRunEmployees.fullName,
          periodMonth: payrollRuns.periodMonth,
          tenantName: tenants.name,
        })
        .from(payslips)
        .innerJoin(
          payrollRunEmployees,
          and(
            eq(payrollRunEmployees.tenantId, payslips.tenantId),
            eq(payrollRunEmployees.runId, payslips.runId),
            eq(payrollRunEmployees.employeeId, payslips.employeeId),
          ),
        )
        .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
        .innerJoin(tenants, eq(tenants.id, payslips.tenantId))
        .where(eq(payslips.id, payslipId));
      return row?.emailStatus === "queued" && row.emailTo ? { ...row, emailTo: row.emailTo } : null;
    });
    if (claimed === null) {
      this.logger.log(`[payslips/email] slip ${payslipId} tidak menunggu email — dilewati`);
      return;
    }

    const monthLabel = formatIdMonth(claimed.periodMonth.slice(0, 7));
    const link = `${this.config.get("APP_WEB_URL", { infer: true })}/me/payslips`;
    try {
      await this.mailer.send({
        to: claimed.emailTo,
        subject: `Slip gaji ${monthLabel} dari ${claimed.tenantName} sudah terbit`,
        text: [
          `Halo ${claimed.fullName},`,
          "",
          `Slip gaji ${monthLabel} Anda dari ${claimed.tenantName} sudah bisa dilihat dan diunduh di portal Exapay:`,
          "",
          link,
          "",
          "Demi keamanan, rincian gaji tidak dicantumkan di email ini — masuk ke akun Anda untuk melihatnya.",
          `Jika Anda tidak bekerja di ${claimed.tenantName}, abaikan email ini.`,
        ].join("\n"),
      });
    } catch (error: unknown) {
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      this.logger.error(`[payslips/email] slip ${payslipId} percobaan ${job.attemptsMade + 1}: ${error instanceof Error ? error.message : String(error)}`);
      if (!lastAttempt) throw error;
      await this.setEmailResult(ctx, payslipId, { emailStatus: "failed", emailError: EMAIL_ERROR });
      throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
    }
    await this.setEmailResult(ctx, payslipId, { emailStatus: "sent", emailSentAt: sql`now()`, emailError: null });
    this.logger.log(`[payslips/email] slip ${payslipId} email terkirim`);
  }

  private async setEmailResult(
    ctx: TenantContext,
    payslipId: string,
    values: { emailStatus: "sent" | "failed"; emailSentAt?: ReturnType<typeof sql>; emailError: string | null },
  ): Promise<void> {
    await withTenant(this.db, ctx, async (tx) => {
      await tx
        .update(payslips)
        .set(values)
        .where(and(eq(payslips.id, payslipId), eq(payslips.emailStatus, "queued")));
    });
  }
}

// Tanggal hari ini (YYYY-MM-DD) di zona waktu usaha
function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
