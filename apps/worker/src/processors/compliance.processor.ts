import {
  complianceDeadlines,
  complianceReminders,
  type Database,
  employees,
  memberships,
  provinces,
  regencies,
  type TenantContext,
  tenants,
  users,
  withTenant,
  type Transaction,
} from "@exapay/db";
import {
  COMPLIANCE_NOTICE_DAYS,
  COMPLIANCE_NOTIFY_JOB,
  COMPLIANCE_QUEUE_NAME,
  COMPLIANCE_REMINDER_KIND_LABELS,
  COMPLIANCE_SCAN_JOB,
  complianceDaysBetween,
  type ComplianceNotice,
  type ComplianceNotifyJobData,
  complianceNotifyJobDataSchema,
  type ComplianceReminderItem,
  complianceRemindersBetween,
  type ComplianceSource,
  DEFAULT_TENANT_TIME_ZONE,
} from "@exapay/shared";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, Queue, UnrecoverableError, Worker } from "bullmq";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Redis } from "ioredis";

import type { Env } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";
import { Mailer } from "../email/mailer.js";
import { formatIdMonth } from "../payslips/payslip-content.js";

const SCHEDULER_ID = "compliance-daily";
const NOTIFY_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

type DueReminder = { item: ComplianceReminderItem; daysUntil: number; notice: ComplianceNotice };

// Kalender kepatuhan (feature 33) — antrean "compliance":
// - compliance-scan (job scheduler harian, default 07:00 WIB): daftar usaha aktif lewat compliance_active_tenant_ids()
//   (SECURITY DEFINER, satu-satunya bacaan lintas tenant — hanya id) → satu job notify per usaha per tanggal.
// - compliance-notify: di bawah RLS usaha itu, hitung pengingat (fungsi murni yang sama dengan API) dengan sisa ≤ 7 hari
//   yang belum selesai; kirim SATU email ringkasan ke owner/admin (email terverifikasi) untuk pengingat yang belum
//   dikirimi pemberitahuan tahapnya (H-7 bila sisa 2–7 hari, H-1 bila sisa ≤ 1 hari); lalu catat notified_h7/h1_at.
//   Email sukses tetapi pencatatan gagal → dikirim ulang saat dicoba ulang (at-least-once).
@Injectable()
export class ComplianceProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ComplianceProcessor.name);
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.queue = new Queue(COMPLIANCE_QUEUE_NAME, { connection: this.connection });
    const pattern = this.config.get("COMPLIANCE_CRON", { infer: true });
    const tz = this.config.get("COMPLIANCE_CRON_TZ", { infer: true });
    // Upsert: aman dipanggil setiap worker start (jadwal lama diganti, tidak menumpuk)
    await this.queue.upsertJobScheduler(SCHEDULER_ID, { pattern, tz }, { name: COMPLIANCE_SCAN_JOB, data: {}, opts: { removeOnComplete: 30, removeOnFail: 30 } });
    this.worker = new Worker(COMPLIANCE_QUEUE_NAME, (job) => this.process(job), { connection: this.connection, concurrency: 2 });
    this.worker.on("failed", (job, error) => this.logger.warn(`[compliance/${job?.name ?? "?"}] job ${job?.id ?? "?"} gagal: ${error.message}`));
    this.logger.log(`Memproses antrean "${COMPLIANCE_QUEUE_NAME}" — pemindaian terjadwal "${pattern}" (${tz})`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async process(job: Job): Promise<void> {
    if (job.name === COMPLIANCE_SCAN_JOB) return this.scan(job);
    if (job.name === COMPLIANCE_NOTIFY_JOB) {
      const data = complianceNotifyJobDataSchema.safeParse(job.data);
      if (!data.success) throw new UnrecoverableError("payload job tidak valid");
      return this.notify(data.data);
    }
    throw new UnrecoverableError(`job tidak dikenal: ${job.name}`);
  }

  private async scan(job: Job): Promise<void> {
    if (!this.queue) throw new Error("antrean belum siap");
    // Lintas tenant terdokumentasi (migration 0028): fungsi definer hanya mengembalikan id usaha aktif
    const result = await this.db.execute<{ id: string }>(sql`SELECT id FROM public.compliance_active_tenant_ids() AS id`);
    // jobId unik per pemindaian (scan yang dicoba ulang tidak menggandakan job); email ganda dicegah notified_h7/h1_at
    const scanId = (job.id ?? "manual").replaceAll(":", "-");
    for (const row of result.rows) {
      const data: ComplianceNotifyJobData = { tenantId: row.id };
      await this.queue.add(COMPLIANCE_NOTIFY_JOB, data, { ...NOTIFY_JOB_OPTIONS, jobId: `compliance-notify_${row.id}_${scanId}` });
    }
    this.logger.log(`[compliance/scan] ${result.rows.length} usaha dijadwalkan`);
  }

  private async notify(data: ComplianceNotifyJobData): Promise<void> {
    const ctx: TenantContext = { tenantId: data.tenantId, userId: null };
    const plan = await withTenant(this.db, ctx, async (tx) => {
      const [tenant] = await tx
        .select({ name: tenants.name, createdAt: tenants.createdAt, timeZone: provinces.timeZone })
        .from(tenants)
        .leftJoin(regencies, eq(regencies.code, tenants.regencyCode))
        .leftJoin(provinces, eq(provinces.code, regencies.provinceCode))
        .where(eq(tenants.id, ctx.tenantId));
      if (!tenant) return null;
      const timeZone = tenant.timeZone ?? DEFAULT_TENANT_TIME_ZONE;
      const today = localDate(new Date(), timeZone);
      const source = await loadSource(tx, localDate(tenant.createdAt, timeZone));
      const upcoming = complianceRemindersBetween(source, today, addDays(today, COMPLIANCE_NOTICE_DAYS.h7));
      if (upcoming.length === 0) return { tenantName: tenant.name, due: [], recipients: [] };

      const states = await tx
        .select({ key: complianceReminders.key, doneAt: complianceReminders.doneAt, h7: complianceReminders.notifiedH7At, h1: complianceReminders.notifiedH1At })
        .from(complianceReminders)
        .where(inArray(complianceReminders.key, upcoming.map((item) => item.key)));
      const stateOf = new Map(states.map((row) => [row.key, row]));
      const due = upcoming.flatMap((item): DueReminder[] => {
        const state = stateOf.get(item.key);
        if (state?.doneAt) return [];
        const daysUntil = complianceDaysBetween(today, item.dueDate);
        const notice: ComplianceNotice = daysUntil <= COMPLIANCE_NOTICE_DAYS.h1 ? "h1" : "h7";
        const sent = notice === "h1" ? state?.h1 : state?.h7;
        return sent ? [] : [{ item, daysUntil, notice }];
      });

      // Penerima: owner/admin usaha ini dengan email terverifikasi (filter tenant eksplisit — lihat memberships di standar)
      const recipients = await tx
        .select({ email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.tenantId, ctx.tenantId), inArray(memberships.role, ["owner", "admin"]), isNotNull(users.emailVerifiedAt)));
      return { tenantName: tenant.name, due, recipients: recipients.map((row) => row.email) };
    });

    if (plan === null) throw new UnrecoverableError("usaha tidak ditemukan");
    if (plan.due.length === 0) {
      this.logger.log(`[compliance/notify] usaha ${data.tenantId}: tidak ada pengingat baru`);
      return;
    }
    if (plan.recipients.length === 0) {
      this.logger.warn(`[compliance/notify] usaha ${data.tenantId}: ${plan.due.length} pengingat tanpa penerima (owner/admin terverifikasi)`);
      return;
    }

    await this.mailer.send({ to: plan.recipients.join(", "), ...this.composeEmail(plan.tenantName, plan.due) });

    await withTenant(this.db, ctx, async (tx) => {
      for (const { item, notice } of plan.due) {
        const mark = notice === "h1" ? { notifiedH1At: sql`now()` } : { notifiedH7At: sql`now()` };
        await tx
          .insert(complianceReminders)
          .values({ tenantId: ctx.tenantId, key: item.key, kind: item.kind, dueDate: item.dueDate, ...mark })
          .onConflictDoUpdate({ target: [complianceReminders.tenantId, complianceReminders.key], set: mark });
      }
    });
    this.logger.log(`[compliance/notify] usaha ${data.tenantId}: email ${plan.due.length} pengingat ke ${plan.recipients.length} penerima`);
  }

  private composeEmail(tenantName: string, due: DueReminder[]): { subject: string; text: string } {
    const link = `${this.config.get("APP_WEB_URL", { infer: true })}/compliance`;
    const nearest = Math.min(...due.map((entry) => entry.daysUntil));
    const lines = due.map(({ item, daysUntil }) => {
      const subject = item.employee ? item.employee.fullName : `masa ${formatIdMonth(item.periodMonth ?? "")}`;
      return `• ${shortDate(item.dueDate)} (${daysLabel(daysUntil)}) — ${COMPLIANCE_REMINDER_KIND_LABELS[item.kind]}, ${subject}`;
    });
    return {
      subject: `Pengingat kepatuhan ${tenantName}: ${due.length} tenggat ${nearest <= 1 ? "segera" : "dalam 7 hari"}`,
      text: [
        `Tenggat kepatuhan ${tenantName} yang perlu disiapkan:`,
        "",
        ...lines,
        "",
        "Buka kalender kepatuhan di Exapay dan tandai selesai setelah disetor/dilaporkan agar pengingat berhenti:",
        link,
        "",
        "Jika tanggal tenggat jatuh pada hari libur, batasnya bergeser ke hari kerja berikutnya.",
      ].join("\n"),
    };
  }
}

// Masukan generator (sama dengan ComplianceService API): aturan tenggat (referensi platform), karyawan usaha (RLS)
async function loadSource(tx: Transaction, since: string): Promise<ComplianceSource> {
  const rules = await tx
    .select({
      kind: complianceDeadlines.kind,
      dueDay: complianceDeadlines.dueDay,
      monthOffset: complianceDeadlines.monthOffset,
      effectiveFrom: complianceDeadlines.effectiveFrom,
      effectiveTo: complianceDeadlines.effectiveTo,
    })
    .from(complianceDeadlines);
  const staff = await tx
    .select({
      id: employees.id,
      fullName: employees.fullName,
      employmentStatus: employees.employmentStatus,
      joinDate: employees.joinDate,
      endDate: employees.endDate,
      contractEndDate: employees.contractEndDate,
      probationEndDate: employees.probationEndDate,
    })
    .from(employees);
  return { rules, employees: staff, since };
}

function daysLabel(daysUntil: number): string {
  if (daysUntil <= 0) return "hari ini";
  if (daysUntil === 1) return "besok";
  return `${daysUntil} hari lagi`;
}

// "2026-10-10" → "10 Okt 2026"
function shortDate(date: string): string {
  return `${Number(date.slice(8, 10))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1] ?? ""} ${date.slice(0, 4)}`;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

// Tanggal (YYYY-MM-DD) di zona waktu usaha
function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
