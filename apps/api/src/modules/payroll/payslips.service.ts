import { employees, payrollRunEmployees, payrollRuns, payslips, users } from "@exapay/db";
import {
  type MyPayslipList,
  PAYSLIP_EMAIL_JOB,
  PAYSLIP_GENERATE_JOB,
  type PayslipRow,
  type PayslipRun,
  type PublishPayslipsResult,
} from "@exapay/shared";
import { ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { PAYSLIP_QUEUE, type PayslipQueue } from "../../redis/redis.module.js";
import { AuditService } from "../audit/audit.service.js";
import { FileStorage } from "../storage/file-storage.js";
import { requireSalaryManager } from "./salary-access.js";

const RUN_NOT_FOUND = "Periode payroll tidak ditemukan";
const PAYSLIP_NOT_FOUND = "Slip gaji tidak ditemukan";
const NOT_FINAL = "Slip gaji dibuat setelah payroll periode ini final";
const EMAIL_ENQUEUE_FAILED = "Email gagal diantrekan. Coba kirim ulang.";

export type PayslipFile = { buffer: Buffer; fileName: string };

// "Slip-Gaji-2026-10-Dewi-Lestari.pdf" — nama hanya huruf/angka/tanda hubung agar aman di header
function payslipFileName(periodMonth: string, fullName: string): string {
  const name = fullName
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `Slip-Gaji-${periodMonth.slice(0, 7)}${name ? `-${name}` : ""}.pdf`;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

// Slip gaji PDF (feature 31). Baris slip dibuat finalisasi payroll (createForRun, transaksi yang sama) untuk karyawan yang
// dihitung; PDF dibuat worker dari snapshot final lewat antrean "payslips" (enqueue setelah commit). Owner/admin melihat
// status, mengunduh, dan MENERBITKAN slip (keputusan user: dibuat otomatis, dikirim manual) — slip terbit terlihat di
// portal karyawan dan karyawan dengan akun portal dikirimi email berisi tautan (tanpa angka gaji). Status di Postgres;
// Redis hanya pembawa job (job yang hilang → "Proses ulang").
@Injectable()
export class PayslipsService {
  private readonly logger = new Logger(PayslipsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(PAYSLIP_QUEUE) private readonly queue: PayslipQueue,
    private readonly storage: FileStorage,
    private readonly audit: AuditService,
  ) {}

  // Dipanggil finalisasi di transaksinya setelah snapshot karyawan tersimpan. Mengembalikan id slip untuk enqueue.
  async createForRun(tx: Transaction, ctx: TenantContext, runId: string): Promise<string[]> {
    const calculated = await tx
      .select({ employeeId: payrollRunEmployees.employeeId })
      .from(payrollRunEmployees)
      .where(and(eq(payrollRunEmployees.runId, runId), eq(payrollRunEmployees.status, "calculated")));
    if (calculated.length === 0) return [];
    const rows = await tx
      .insert(payslips)
      .values(calculated.map((row) => ({ tenantId: ctx.tenantId, runId, employeeId: row.employeeId })))
      .returning({ id: payslips.id });
    return rows.map((row) => row.id);
  }

  // Setelah commit. Gagal enqueue tidak menggagalkan pemanggil — slip tetap "menunggu" dan bisa diproses ulang.
  async enqueueGeneration(tenantId: string, payslipIds: readonly string[], retry = false): Promise<void> {
    if (payslipIds.length === 0) return;
    try {
      // jobId unik per permintaan proses ulang — job lama dengan id sama (gagal, disimpan 7 hari) tidak menghalangi
      const suffix = retry ? `-${Date.now()}` : "";
      await this.queue.addBulk(
        payslipIds.map((payslipId) => ({ name: PAYSLIP_GENERATE_JOB, data: { tenantId, payslipId }, opts: { jobId: `${payslipId}${suffix}` } })),
      );
    } catch (error: unknown) {
      this.logger.error(`[payslips/enqueue] gagal enqueue ${payslipIds.length} slip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ——— owner/admin ———

  async list(user: AuthUser, runId: string): Promise<PayslipRun> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findFinalRun(tx, runId);
      const rows = await tx
        .select({
          id: payslips.id,
          employeeId: payslips.employeeId,
          fullName: payrollRunEmployees.fullName,
          employeeNumber: payrollRunEmployees.employeeNumber,
          takeHomePay: payrollRunEmployees.takeHomePay,
          status: payslips.status,
          error: payslips.error,
          generatedAt: payslips.generatedAt,
          publishedAt: payslips.publishedAt,
          portalUserId: employees.userId,
          emailStatus: payslips.emailStatus,
          emailTo: payslips.emailTo,
          emailRequestedAt: payslips.emailRequestedAt,
          emailSentAt: payslips.emailSentAt,
          emailError: payslips.emailError,
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
        .innerJoin(employees, eq(employees.id, payslips.employeeId))
        .where(eq(payslips.runId, run.id))
        .orderBy(asc(payrollRunEmployees.fullName), asc(payslips.employeeId));
      const [excluded] = await tx
        .select({ value: count() })
        .from(payrollRunEmployees)
        .where(and(eq(payrollRunEmployees.runId, run.id), eq(payrollRunEmployees.status, "excluded")));

      return {
        run: { id: run.id, month: run.periodMonth.slice(0, 7), periodStart: run.periodStart, periodEnd: run.periodEnd, payDate: run.payDate },
        rows: rows.map(
          (row): PayslipRow => ({
            id: row.id,
            employee: { id: row.employeeId, fullName: row.fullName, employeeNumber: row.employeeNumber },
            // Slip hanya untuk karyawan dihitung (CHECK snapshot: angka terisi)
            takeHomePay: row.takeHomePay ?? "0",
            status: row.status,
            error: row.error,
            generatedAt: iso(row.generatedAt),
            publishedAt: iso(row.publishedAt),
            hasPortalAccount: row.portalUserId !== null,
            email:
              row.emailStatus && row.emailTo && row.emailRequestedAt
                ? {
                    status: row.emailStatus,
                    to: row.emailTo,
                    requestedAt: row.emailRequestedAt.toISOString(),
                    sentAt: iso(row.emailSentAt),
                    error: row.emailError,
                  }
                : null,
          }),
        ),
        excludedCount: excluded?.value ?? 0,
      };
    });
  }

  // Slip gagal / masih menunggu (job hilang, mis. Redis mati saat finalisasi) dimasukkan ulang ke antrean
  async retry(user: AuthUser, runId: string): Promise<{ queued: number }> {
    const ctx = tenantContextOf(user);
    const ids = await withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findFinalRun(tx, runId);
      const rows = await tx
        .update(payslips)
        .set({ status: "pending", error: null })
        .where(and(eq(payslips.runId, run.id), inArray(payslips.status, ["pending", "failed"])))
        .returning({ id: payslips.id });
      return rows.map((row) => row.id);
    });
    if (ids.length === 0) throw new ConflictException("Tidak ada slip yang perlu diproses ulang");
    await this.enqueueGeneration(ctx.tenantId, ids, true);
    return { queued: ids.length };
  }

  // Terbitkan semua slip siap yang belum terbit; email pemberitahuan untuk karyawan berakun portal
  async publish(user: AuthUser, runId: string): Promise<PublishPayslipsResult> {
    const ctx = tenantContextOf(user);
    const result = await withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findFinalRun(tx, runId);
      const targets = await tx
        .select({ id: payslips.id, email: users.email })
        .from(payslips)
        .innerJoin(employees, eq(employees.id, payslips.employeeId))
        .leftJoin(users, eq(users.id, employees.userId))
        .where(and(eq(payslips.runId, run.id), eq(payslips.status, "ready"), isNull(payslips.publishedAt)))
        .for("update", { of: payslips });
      if (targets.length === 0) throw new ConflictException("Tidak ada slip siap yang belum diterbitkan");

      const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
      const publishedBy = { publishedAt: sql`now()`, publishedByUserId: user.userId, publishedByName: actor?.fullName ?? null };
      const withEmail = targets.filter((target): target is { id: string; email: string } => target.email !== null);
      const withoutEmail = targets.filter((target) => target.email === null);
      for (const target of withEmail) {
        await tx
          .update(payslips)
          .set({ ...publishedBy, emailStatus: "queued", emailTo: target.email, emailRequestedAt: sql`now()`, emailSentAt: null, emailError: null })
          .where(eq(payslips.id, target.id));
      }
      if (withoutEmail.length > 0) {
        await tx
          .update(payslips)
          .set(publishedBy)
          .where(inArray(payslips.id, withoutEmail.map((target) => target.id)));
      }
      await this.audit.record(tx, ctx, {
        entity: "payroll_run",
        entityId: run.id,
        action: "publish_payslips",
        after: { published: targets.map((target) => target.id), emailed: withEmail.length },
      });
      return { published: targets.length, emailIds: withEmail.map((target) => target.id) };
    });
    await this.enqueueEmails(ctx, result.emailIds);
    return { published: result.published, emailed: result.emailIds.length };
  }

  // Kirim ulang email pemberitahuan satu slip terbit (alamat dibaca ulang dari akun portal saat ini)
  async resendEmail(user: AuthUser, runId: string, payslipId: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findFinalRun(tx, runId);
      const [row] = await tx
        .select({ publishedAt: payslips.publishedAt, emailStatus: payslips.emailStatus, email: users.email })
        .from(payslips)
        .innerJoin(employees, eq(employees.id, payslips.employeeId))
        .leftJoin(users, eq(users.id, employees.userId))
        .where(and(eq(payslips.id, payslipId), eq(payslips.runId, run.id)))
        .for("update", { of: payslips });
      if (!row) throw new NotFoundException(PAYSLIP_NOT_FOUND);
      if (!row.publishedAt) throw new ConflictException("Terbitkan slip ini dulu sebelum mengirim email");
      if (!row.email) throw new ConflictException("Karyawan ini belum punya akun portal — bagikan slip secara langsung");
      if (row.emailStatus === "queued") throw new ConflictException("Email slip ini sedang dikirim");
      await tx
        .update(payslips)
        .set({ emailStatus: "queued", emailTo: row.email, emailRequestedAt: sql`now()`, emailSentAt: null, emailError: null })
        .where(eq(payslips.id, payslipId));
      await this.audit.record(tx, ctx, { entity: "payslip", entityId: payslipId, action: "resend_email", after: { runId: run.id } });
    });
    await this.enqueueEmails(ctx, [payslipId]);
  }

  // Owner/admin boleh membuka slip sebelum terbit (memeriksa)
  async file(user: AuthUser, runId: string, payslipId: string): Promise<PayslipFile> {
    const ctx = tenantContextOf(user);
    const found = await withTenant(this.db, ctx, async (tx) => {
      await requireSalaryManager(tx, ctx);
      const run = await this.findFinalRun(tx, runId);
      const [row] = await this.selectFile(tx)
        .where(and(eq(payslips.id, payslipId), eq(payslips.runId, run.id)));
      return row;
    });
    return this.readFile(found);
  }

  // ——— portal karyawan ———

  async myList(user: AuthUser): Promise<MyPayslipList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const employeeId = await this.ownEmployeeId(tx, user.userId);
      if (!employeeId) return { access: "not_linked" };
      const rows = await tx
        .select({
          id: payslips.id,
          periodMonth: payrollRuns.periodMonth,
          periodStart: payrollRuns.periodStart,
          periodEnd: payrollRuns.periodEnd,
          payDate: sql<string | null>`${payrollRuns.snapshot}->>'payDate'`,
          takeHomePay: payrollRunEmployees.takeHomePay,
          publishedAt: payslips.publishedAt,
        })
        .from(payslips)
        .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
        .innerJoin(
          payrollRunEmployees,
          and(
            eq(payrollRunEmployees.tenantId, payslips.tenantId),
            eq(payrollRunEmployees.runId, payslips.runId),
            eq(payrollRunEmployees.employeeId, payslips.employeeId),
          ),
        )
        .where(and(eq(payslips.employeeId, employeeId), isNotNull(payslips.publishedAt)))
        .orderBy(desc(payrollRuns.periodMonth));
      return {
        access: "ok",
        payslips: rows.flatMap((row) =>
          row.publishedAt && row.periodStart && row.periodEnd
            ? [
                {
                  id: row.id,
                  month: row.periodMonth.slice(0, 7),
                  periodStart: row.periodStart,
                  periodEnd: row.periodEnd,
                  payDate: row.payDate,
                  takeHomePay: row.takeHomePay ?? "0",
                  publishedAt: row.publishedAt.toISOString(),
                },
              ]
            : [],
        ),
      };
    });
  }

  // Hanya slip milik sendiri yang sudah terbit; selain itu 404 (tidak membocorkan keberadaan slip)
  async myFile(user: AuthUser, payslipId: string): Promise<PayslipFile> {
    const ctx = tenantContextOf(user);
    const found = await withTenant(this.db, ctx, async (tx) => {
      const employeeId = await this.ownEmployeeId(tx, user.userId);
      if (!employeeId) return undefined;
      const [row] = await this.selectFile(tx).where(
        and(eq(payslips.id, payslipId), eq(payslips.employeeId, employeeId), isNotNull(payslips.publishedAt)),
      );
      return row;
    });
    return this.readFile(found);
  }

  // ——— internal ———

  private selectFile(tx: Transaction) {
    return tx
      .select({ status: payslips.status, fileKey: payslips.fileKey, periodMonth: payrollRuns.periodMonth, fullName: payrollRunEmployees.fullName })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payrollRuns.id, payslips.runId))
      .innerJoin(
        payrollRunEmployees,
        and(
          eq(payrollRunEmployees.tenantId, payslips.tenantId),
          eq(payrollRunEmployees.runId, payslips.runId),
          eq(payrollRunEmployees.employeeId, payslips.employeeId),
        ),
      )
      .$dynamic();
  }

  private async readFile(found: { status: string; fileKey: string | null; periodMonth: string; fullName: string } | undefined): Promise<PayslipFile> {
    if (!found) throw new NotFoundException(PAYSLIP_NOT_FOUND);
    if (found.status !== "ready" || !found.fileKey) throw new ConflictException("Slip gaji ini belum selesai dibuat");
    try {
      return { buffer: await this.storage.get(found.fileKey), fileName: payslipFileName(found.periodMonth, found.fullName) };
    } catch (error: unknown) {
      this.logger.error(`[payslips/file] ${found.fileKey}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Slip gaji tidak dapat dibuka saat ini. Coba lagi nanti.");
    }
  }

  private async findFinalRun(tx: Transaction, runId: string) {
    const [run] = await tx
      .select({
        id: payrollRuns.id,
        periodMonth: payrollRuns.periodMonth,
        status: payrollRuns.status,
        periodStart: payrollRuns.periodStart,
        periodEnd: payrollRuns.periodEnd,
        payDate: sql<string | null>`${payrollRuns.snapshot}->>'payDate'`,
      })
      .from(payrollRuns)
      .where(eq(payrollRuns.id, runId));
    if (!run) throw new NotFoundException(RUN_NOT_FOUND);
    if (run.status !== "final" || !run.periodStart || !run.periodEnd) throw new ConflictException(NOT_FINAL);
    return { ...run, periodStart: run.periodStart, periodEnd: run.periodEnd };
  }

  // Data karyawan tertaut ke akun ini di usaha aktif (unik per tenant; karyawan yang sudah keluar tetap bisa melihat slipnya)
  private async ownEmployeeId(tx: Transaction, userId: string): Promise<string | null> {
    const [row] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.userId, userId));
    return row?.id ?? null;
  }

  private async enqueueEmails(ctx: TenantContext, payslipIds: readonly string[]): Promise<void> {
    if (payslipIds.length === 0) return;
    try {
      // jobId unik per permintaan — kirim ulang tidak tertahan job lama dengan id sama
      const stamp = Date.now();
      await this.queue.addBulk(
        payslipIds.map((payslipId) => ({
          name: PAYSLIP_EMAIL_JOB,
          data: { tenantId: ctx.tenantId, payslipId },
          opts: { jobId: `${payslipId}-email-${stamp}` },
        })),
      );
    } catch (error: unknown) {
      this.logger.error(`[payslips/email] gagal enqueue ${payslipIds.length} email: ${error instanceof Error ? error.message : String(error)}`);
      await withTenant(this.db, ctx, async (tx) => {
        await tx
          .update(payslips)
          .set({ emailStatus: "failed", emailError: EMAIL_ENQUEUE_FAILED })
          .where(and(inArray(payslips.id, [...payslipIds]), eq(payslips.emailStatus, "queued")));
      });
    }
  }

}
