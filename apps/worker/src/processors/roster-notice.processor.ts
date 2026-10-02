import { type Database, employees, provinces, regencies, shiftRosterDays, type TenantContext, tenants, users, withTenant } from "@exapay/db";
import { DEFAULT_TENANT_TIME_ZONE, isOvernightShift, ROSTER_NOTIFY_JOB, ROSTER_QUEUE_NAME, type RosterNotifyJobData, rosterNotifyJobDataSchema } from "@exapay/shared";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, UnrecoverableError, Worker } from "bullmq";
import { and, asc, between, eq, isNotNull } from "drizzle-orm";
import { Redis } from "ioredis";

import type { Env } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";
import { Mailer } from "../email/mailer.js";

// Jadwal yang dicantumkan di email: hari ini + 13 hari
const NOTICE_DAYS = 14;
const WEEKDAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

type Plan = { to: string; subject: string; text: string } | { skip: string };

// Pemberitahuan perubahan roster shift (feature 46) — antrean "roster", job `roster-notify` { tenantId, employeeId } yang
// ditambahkan API dengan jeda (perubahan berdekatan digabung). Di bawah RLS usaha itu: kirim satu email ke karyawan berisi
// jadwal 14 hari ke depan. Penerima: email akun portal yang terverifikasi, cadangan email di data karyawan.
// Karyawan sudah bukan mode shift / keluar / tanpa email → dilewati (bukan gagal).
@Injectable()
export class RosterNoticeProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(RosterNoticeProcessor.name);
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly mailer: Mailer,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
    this.connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.worker = new Worker(ROSTER_QUEUE_NAME, (job) => this.process(job), { connection: this.connection, concurrency: 2 });
    this.worker.on("failed", (job, error) => this.logger.warn(`[roster/${job?.name ?? "?"}] job ${job?.id ?? "?"} gagal: ${error.message}`));
    this.logger.log(`Memproses antrean "${ROSTER_QUEUE_NAME}"`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.connection?.quit();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== ROSTER_NOTIFY_JOB) throw new UnrecoverableError(`job tidak dikenal: ${job.name}`);
    const data = rosterNotifyJobDataSchema.safeParse(job.data);
    if (!data.success) throw new UnrecoverableError("payload job tidak valid");
    await this.notify(data.data);
  }

  // `now` bisa digeser (test)
  async notify(data: RosterNotifyJobData, now = new Date()): Promise<"sent" | "skipped"> {
    const plan = await this.plan(data, now);
    if ("skip" in plan) {
      this.logger.log(`[roster/notify] ${data.employeeId}: dilewati (${plan.skip})`);
      return "skipped";
    }
    await this.mailer.send(plan);
    this.logger.log(`[roster/notify] ${data.employeeId}: email jadwal terkirim`);
    return "sent";
  }

  private async plan(data: RosterNotifyJobData, now: Date): Promise<Plan> {
    const ctx: TenantContext = { tenantId: data.tenantId, userId: null };
    return withTenant(this.db, ctx, async (tx) => {
      const [tenant] = await tx
        .select({ name: tenants.name, timeZone: provinces.timeZone })
        .from(tenants)
        .leftJoin(regencies, eq(regencies.code, tenants.regencyCode))
        .leftJoin(provinces, eq(provinces.code, regencies.provinceCode))
        .where(eq(tenants.id, ctx.tenantId));
      if (!tenant) throw new UnrecoverableError("usaha tidak ditemukan");
      const [employee] = await tx
        .select({ fullName: employees.fullName, scheduleMode: employees.scheduleMode, endDate: employees.endDate, email: employees.email, userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, data.employeeId));
      if (!employee) return { skip: "karyawan tidak ditemukan" };
      if (employee.scheduleMode !== "shift") return { skip: "bukan mode shift" };
      if (employee.endDate !== null) return { skip: "karyawan sudah keluar" };

      const [account] = employee.userId
        ? await tx.select({ email: users.email }).from(users).where(and(eq(users.id, employee.userId), isNotNull(users.emailVerifiedAt)))
        : [];
      const to = account?.email ?? employee.email;
      if (!to) return { skip: "tanpa email" };

      const timeZone = tenant.timeZone ?? DEFAULT_TENANT_TIME_ZONE;
      const today = localDate(now, timeZone);
      const last = addDays(today, NOTICE_DAYS - 1);
      const rows = await tx
        .select({ workDate: shiftRosterDays.workDate, shiftName: shiftRosterDays.shiftName, startTime: shiftRosterDays.startTime, endTime: shiftRosterDays.endTime })
        .from(shiftRosterDays)
        .where(and(eq(shiftRosterDays.employeeId, data.employeeId), between(shiftRosterDays.workDate, today, last)))
        .orderBy(asc(shiftRosterDays.workDate));
      const byDate = new Map(rows.map((row) => [row.workDate, row]));
      const lines = Array.from({ length: NOTICE_DAYS }, (_, index) => {
        const date = addDays(today, index);
        const row = byDate.get(date);
        let entry = "belum diatur";
        if (row) {
          if (row.shiftName && row.startTime && row.endTime) {
            const start = row.startTime.slice(0, 5);
            const end = row.endTime.slice(0, 5);
            entry = `${row.shiftName} ${start}–${end}${isOvernightShift(start, end) ? " (selesai besok)" : ""}`;
          } else {
            entry = "Libur";
          }
        }
        return `• ${dayLabel(date)} — ${entry}`;
      });

      return {
        to,
        subject: `Jadwal shift Anda di ${tenant.name} diperbarui`,
        text: [
          `Halo ${employee.fullName},`,
          "",
          `Jadwal shift Anda di ${tenant.name} baru saja diperbarui. Jadwal 14 hari ke depan:`,
          "",
          ...lines,
          "",
          "Lihat jadwal terbaru di portal Exapay:",
          `${this.config.get("APP_WEB_URL", { infer: true })}/me`,
          "",
          "Hari tanpa shift dihitung libur. Hubungi atasan Anda jika ada yang tidak sesuai.",
        ].join("\n"),
      };
    });
  }
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

// "Sen 5 Okt"
function dayLabel(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[value.getUTCDay()] ?? ""} ${value.getUTCDate()} ${MONTHS[value.getUTCMonth()] ?? ""}`;
}
