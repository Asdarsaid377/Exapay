import { attendanceRecords, type Database, type TenantContext, withTenant } from "@exapay/db";
import {
  ATTENDANCE_SELFIE_PURGE_JOB,
  ATTENDANCE_SELFIE_QUEUE_NAME,
  ATTENDANCE_SELFIE_SCAN_JOB,
  type AttendanceSelfiePurgeJobData,
  attendanceSelfiePurgeJobDataSchema,
  SELFIE_RETENTION_DAYS,
} from "@exapay/shared";
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type Job, Queue, UnrecoverableError, Worker } from "bullmq";
import { and, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { Redis } from "ioredis";

import type { Env } from "../config/env.js";
import { DRIZZLE } from "../database/database.module.js";
import { FileStorage } from "../storage/file-storage.js";

const SCHEDULER_ID = "attendance-selfie-retention-daily";
const PURGE_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential", delay: 60_000 },
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
// Baris per putaran — UMKM < 50 karyawan, satu hari ≈ puluhan baris
const BATCH_SIZE = 200;

type SelfieRow = { id: string; checkInKey: string | null; checkOutKey: string | null };

// Tanggal kerja paling awal yang selfie-nya masih disimpan: selfie dengan work_date < cutoff dihapus (disimpan 90 hari)
export function selfieRetentionCutoff(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) - SELFIE_RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
}

// Penghapusan selfie absen kedaluwarsa (feature 45) — antrean "attendance-selfies":
// - selfie-retention-scan (job scheduler harian, default 02:30 WIB): daftar usaha yang punya selfie lebih tua dari cutoff
//   lewat attendance_selfie_expired_tenant_ids() (SECURITY DEFINER, satu-satunya bacaan lintas tenant — hanya id)
//   → satu job purge per usaha.
// - selfie-retention-purge: di bawah RLS usaha itu, hapus file di storage lalu kosongkan key (jenis foto tetap = tanda
//   "foto sudah dihapus"). File dihapus dulu: gagal → key tetap, dicoba ulang; key gagal dikosongkan → hapus ulang idempoten.
@Injectable()
export class AttendanceSelfieProcessor implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AttendanceSelfieProcessor.name);
  private worker: Worker | null = null;
  private queue: Queue | null = null;
  private connection: Redis | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly storage: FileStorage,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.connection = new Redis(this.config.get("REDIS_URL", { infer: true }), { maxRetriesPerRequest: null });
    this.queue = new Queue(ATTENDANCE_SELFIE_QUEUE_NAME, { connection: this.connection });
    const pattern = this.config.get("SELFIE_RETENTION_CRON", { infer: true });
    const tz = this.config.get("SELFIE_RETENTION_CRON_TZ", { infer: true });
    // Upsert: aman dipanggil setiap worker start (jadwal lama diganti, tidak menumpuk)
    await this.queue.upsertJobScheduler(SCHEDULER_ID, { pattern, tz }, { name: ATTENDANCE_SELFIE_SCAN_JOB, data: {}, opts: { removeOnComplete: 30, removeOnFail: 30 } });
    this.worker = new Worker(ATTENDANCE_SELFIE_QUEUE_NAME, (job) => this.process(job), { connection: this.connection, concurrency: 2 });
    this.worker.on("failed", (job, error) => this.logger.warn(`[selfie/${job?.name ?? "?"}] job ${job?.id ?? "?"} gagal: ${error.message}`));
    this.logger.log(`Memproses antrean "${ATTENDANCE_SELFIE_QUEUE_NAME}" — penghapusan terjadwal "${pattern}" (${tz})`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  async process(job: Job): Promise<void> {
    if (job.name === ATTENDANCE_SELFIE_SCAN_JOB) return this.scan(job);
    if (job.name === ATTENDANCE_SELFIE_PURGE_JOB) {
      const data = attendanceSelfiePurgeJobDataSchema.safeParse(job.data);
      if (!data.success) throw new UnrecoverableError("payload job tidak valid");
      await this.purge(data.data);
      return;
    }
    throw new UnrecoverableError(`job tidak dikenal: ${job.name}`);
  }

  // Lintas tenant terdokumentasi (migration 0036): fungsi definer hanya mengembalikan id usaha
  async expiredTenantIds(cutoff: string): Promise<string[]> {
    const result = await this.db.execute<{ id: string }>(sql`SELECT id FROM public.attendance_selfie_expired_tenant_ids(${cutoff}::date) AS id`);
    return result.rows.map((row) => row.id);
  }

  // Jumlah file yang dihapus
  async purge(data: AttendanceSelfiePurgeJobData): Promise<number> {
    const ctx: TenantContext = { tenantId: data.tenantId, userId: null };
    const expired = and(
      lt(attendanceRecords.workDate, data.cutoff),
      or(isNotNull(attendanceRecords.checkInSelfieKey), isNotNull(attendanceRecords.checkOutSelfieKey)),
    );
    let removed = 0;
    for (;;) {
      const rows: SelfieRow[] = await withTenant(this.db, ctx, (tx) =>
        tx
          .select({ id: attendanceRecords.id, checkInKey: attendanceRecords.checkInSelfieKey, checkOutKey: attendanceRecords.checkOutSelfieKey })
          .from(attendanceRecords)
          .where(expired)
          .limit(BATCH_SIZE),
      );
      if (rows.length === 0) break;

      for (const row of rows) {
        for (const key of [row.checkInKey, row.checkOutKey]) {
          if (!key) continue;
          // Gagal → job gagal & dicoba ulang; key belum dikosongkan sehingga file tidak terlupakan
          await this.storage.remove(key);
          removed += 1;
        }
      }
      await withTenant(this.db, ctx, async (tx) => {
        for (const row of rows) {
          const updated = await tx
            .update(attendanceRecords)
            .set({ checkInSelfieKey: null, checkOutSelfieKey: null })
            .where(and(eq(attendanceRecords.id, row.id), lt(attendanceRecords.workDate, data.cutoff)))
            .returning({ id: attendanceRecords.id });
          // Tidak boleh terjadi — mencegah putaran tanpa akhir bila baris tidak bisa dikosongkan
          if (updated.length === 0) throw new Error(`absen ${row.id} tidak dapat diperbarui`);
        }
      });
      if (rows.length < BATCH_SIZE) break;
    }
    this.logger.log(`[selfie/purge] usaha ${data.tenantId}: ${removed} foto sebelum ${data.cutoff} dihapus`);
    return removed;
  }

  private async scan(job: Job): Promise<void> {
    if (!this.queue) throw new Error("antrean belum siap");
    const today = localDate(new Date(), this.config.get("SELFIE_RETENTION_CRON_TZ", { infer: true }));
    const cutoff = selfieRetentionCutoff(today);
    const tenantIds = await this.expiredTenantIds(cutoff);
    // jobId unik per pemindaian (scan yang dicoba ulang tidak menggandakan job)
    const scanId = (job.id ?? "manual").replaceAll(":", "-");
    for (const tenantId of tenantIds) {
      const data: AttendanceSelfiePurgeJobData = { tenantId, cutoff };
      await this.queue.add(ATTENDANCE_SELFIE_PURGE_JOB, data, { ...PURGE_JOB_OPTIONS, jobId: `selfie-purge_${tenantId}_${scanId}` });
    }
    this.logger.log(`[selfie/scan] cutoff ${cutoff}: ${tenantIds.length} usaha dijadwalkan`);
  }
}

// Tanggal (YYYY-MM-DD) di zona waktu tertentu
function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}
