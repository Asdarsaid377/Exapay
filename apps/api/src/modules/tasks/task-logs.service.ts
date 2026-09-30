import { randomUUID } from "node:crypto";

import { attendanceRecords, employees, kpiIndicators, kpiTemplates, positions, taskLogs } from "@exapay/db";
import {
  type LoggableKpiIndicatorType,
  LOGGABLE_KPI_INDICATOR_TYPES,
  type KpiTargetPeriod,
  type MyTaskDay,
  TASK_LOG_BACKDATE_DAYS,
  TASK_LOGS_PER_DAY_MAX,
  type TaskIndicatorDay,
  type TaskLog,
  type TaskLogInput,
  type TaskLogStatus,
  type TaskLogUpdateInput,
  type TaskPhotoType,
  trimDecimal,
} from "@exapay/shared";
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { and, asc, between, count, desc, eq, inArray, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { foreignKeyViolationConstraint } from "../../database/errors.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock } from "../attendance/attendance-clock.js";
import { loadAttendanceViewer, viewerCanSee } from "../attendance/attendance-viewer.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { FileStorage, tenantFileKey } from "../storage/file-storage.js";
import { datesDescending, detectTaskPhotoType, earliestLogDate, isTaskLogEditable, isWholeQuantity, TASK_PHOTO_EXTENSIONS } from "./task-log-rules.js";

// Bagian file multipart yang dipakai (multer memory storage)
export type UploadedPhoto = { buffer: Buffer; size: number };

export type PhotoFile = { buffer: Buffer; contentType: TaskPhotoType };

const NOT_FOUND = "Catatan tugas tidak ditemukan";
const NOT_CHECKED_IN = "Absen masuk dulu di tanggal ini sebelum mencatat tugas";
const OUTSIDE_WINDOW = `Tugas hanya bisa dicatat untuk hari ini sampai ${TASK_LOG_BACKDATE_DAYS} hari ke belakang`;
const UNKNOWN_INDICATOR = "Indikator tidak ada di template KPI jabatan Anda. Muat ulang halaman lalu coba lagi.";

type LoggableIndicator = {
  id: string;
  name: string;
  type: LoggableKpiIndicatorType;
  unit: string;
  target: string;
  targetPeriod: KpiTargetPeriod;
};

type CurrentTemplate = { id: string; name: string; indicators: LoggableIndicator[] };

const logColumns = {
  id: taskLogs.id,
  workDate: taskLogs.workDate,
  indicatorId: taskLogs.indicatorId,
  indicatorName: kpiIndicators.name,
  indicatorType: kpiIndicators.type,
  indicatorUnit: kpiIndicators.unit,
  quantity: taskLogs.quantity,
  note: taskLogs.note,
  photoType: taskLogs.photoType,
  photoSize: taskLogs.photoSize,
  status: taskLogs.status,
  createdAt: taskLogs.createdAt,
  updatedAt: taskLogs.updatedAt,
  editedAt: taskLogs.editedAt,
  verifiedQuantity: taskLogs.verifiedQuantity,
  decidedAt: taskLogs.decidedAt,
  decidedByName: taskLogs.decidedByName,
  decisionNote: taskLogs.decisionNote,
};

type LogRow = {
  id: string;
  workDate: string;
  indicatorId: string | null;
  indicatorName: string | null;
  indicatorType: string | null;
  indicatorUnit: string | null;
  quantity: string | null;
  note: string | null;
  photoType: TaskPhotoType | null;
  photoSize: number | null;
  status: TaskLogStatus;
  createdAt: Date;
  updatedAt: Date;
  editedAt: Date | null;
  verifiedQuantity: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
};

export function isLoggableType(type: string | null): type is LoggableKpiIndicatorType {
  return LOGGABLE_KPI_INDICATOR_TYPES.some((loggable) => loggable === type);
}

// Isi catatan tanpa indikator/editable — dipakai juga daftar verifikasi (feature 20)
export function taskLogFields(row: Omit<LogRow, "indicatorId" | "indicatorName" | "indicatorType" | "indicatorUnit">): Omit<TaskLog, "indicator" | "editable"> {
  return {
    id: row.id,
    workDate: row.workDate,
    quantity: row.quantity === null ? null : trimDecimal(row.quantity),
    note: row.note,
    photo: row.photoType && row.photoSize !== null ? { contentType: row.photoType, size: row.photoSize } : null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    verifiedQuantity: row.verifiedQuantity === null ? null : trimDecimal(row.verifiedQuantity),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decidedByName: row.decidedByName,
    decisionNote: row.decisionNote,
  };
}

function toTaskLog(row: LogRow, editable: boolean): TaskLog {
  return {
    ...taskLogFields(row),
    // Indikator yang tipenya berubah tidak mungkin punya log (ditolak template KPI) — guard untuk tipe TS
    indicator:
      row.indicatorId && row.indicatorName && isLoggableType(row.indicatorType)
        ? { id: row.indicatorId, name: row.indicatorName, type: row.indicatorType, unit: row.indicatorUnit ?? "" }
        : null,
    editable,
  };
}

// Log tugas harian milik sendiri (feature 19, portal /me/tasks & kartu "Tugas hari ini" di /me). Semua peran yang akunnya
// tertaut data karyawan aktif. Wajib absen masuk di tanggal itu (FK task_logs_attendance_fk); jendela hari ini − 7 hari.
// Pencatatan oleh karyawan tanpa audit log (baris = catatannya) — verifikasi atasan (feature 20) yang diaudit.
@Injectable()
export class TaskLogsService {
  private readonly logger = new Logger(TaskLogsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly storage: FileStorage,
  ) {}

  async myDay(user: AuthUser, date: string | undefined): Promise<MyTaskDay> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const selected = date ?? today;
      const employee = await this.attendance.ownEmployee(tx, user.userId);
      const access = this.attendance.accessOf(employee, today);
      if (!employee) {
        return { access, timeZone, today, minDate: today, date: selected, checkedIn: false, canLog: false, template: null, indicators: [], otherCount: 0, logs: [], days: [] };
      }

      const minDate = earliestLogDate(today, employee.joinDate);
      const windowDates = minDate <= today ? datesDescending(minDate, today) : [];
      const rangeFrom = selected < minDate ? selected : minDate;
      const rangeTo = selected > today ? selected : today;
      const checkedInDates = new Set(
        (
          await tx
            .select({ workDate: attendanceRecords.workDate })
            .from(attendanceRecords)
            .where(and(eq(attendanceRecords.employeeId, employee.id), between(attendanceRecords.workDate, rangeFrom, rangeTo)))
        ).map((row) => row.workDate),
      );
      const countRows = await tx
        .select({ workDate: taskLogs.workDate, total: count() })
        .from(taskLogs)
        .where(and(eq(taskLogs.employeeId, employee.id), between(taskLogs.workDate, minDate, today)))
        .groupBy(taskLogs.workDate);
      const countByDate = new Map(countRows.map((row) => [row.workDate, row.total]));

      const template = await this.currentTemplate(tx, employee.id);
      const rows = await this.logsOf(tx, employee.id, selected);
      const totals = await tx
        .select({
          indicatorId: taskLogs.indicatorId,
          // Angka koreksi atasan menggantikan angka karyawan
          total: sql<string>`coalesce(sum(coalesce(${taskLogs.verifiedQuantity}, ${taskLogs.quantity})) filter (where ${taskLogs.status} <> 'rejected'), 0)::text`,
        })
        .from(taskLogs)
        .where(and(eq(taskLogs.employeeId, employee.id), eq(taskLogs.workDate, selected)))
        .groupBy(taskLogs.indicatorId);
      const totalByIndicator = new Map(totals.map((row) => [row.indicatorId, row.total]));

      const indicators: TaskIndicatorDay[] = (template?.indicators ?? []).map((indicator) => {
        const own = rows.filter((row) => row.indicatorId === indicator.id);
        return {
          ...indicator,
          total: trimDecimal(totalByIndicator.get(indicator.id) ?? "0"),
          entryCount: own.length,
          pendingCount: own.filter((row) => row.status === "pending").length,
          approvedCount: own.filter((row) => row.status === "approved").length,
          rejectedCount: own.filter((row) => row.status === "rejected").length,
          // Baris urut terbaru dulu
          lastLoggedAt: own[0]?.createdAt.toISOString() ?? null,
        };
      });

      const checkedIn = checkedInDates.has(selected);
      const inWindow = selected >= minDate && selected <= today;
      return {
        access,
        timeZone,
        today,
        minDate,
        date: selected,
        checkedIn,
        canLog: access === "ok" && inWindow && checkedIn,
        template: template ? { id: template.id, name: template.name } : null,
        indicators,
        otherCount: rows.filter((row) => row.indicatorId === null).length,
        logs: rows.map((row) => toTaskLog(row, access === "ok" && isTaskLogEditable(row.status, row.workDate, minDate, today))),
        days: windowDates.map((day) => ({ date: day, checkedIn: checkedInDates.has(day), count: countByDate.get(day) ?? 0 })),
      };
    });
  }

  async create(user: AuthUser, input: TaskLogInput, file: UploadedPhoto | null): Promise<TaskLog> {
    const photo = file ? this.inspectPhoto(file) : null;
    const ctx = tenantContextOf(user);
    const id = randomUUID();
    const key = photo ? this.photoKey(ctx.tenantId, id, photo.contentType) : null;
    let uploaded = false;

    try {
      return await withTenant(this.db, ctx, async (tx) => {
        const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
        const today = localClock(new Date(), timeZone).date;
        const employee = await this.attendance.requireEmployee(tx, user.userId, today);
        const minDate = earliestLogDate(today, employee.joinDate);
        if (input.workDate < minDate || input.workDate > today) throw new BadRequestException(OUTSIDE_WINDOW);

        const [record] = await tx
          .select({ id: attendanceRecords.id })
          .from(attendanceRecords)
          .where(and(eq(attendanceRecords.employeeId, employee.id), eq(attendanceRecords.workDate, input.workDate)));
        if (!record) throw new ConflictException(NOT_CHECKED_IN);
        await this.assertIndicator(tx, employee.id, input);

        const [existing] = await tx
          .select({ total: count() })
          .from(taskLogs)
          .where(and(eq(taskLogs.employeeId, employee.id), eq(taskLogs.workDate, input.workDate)));
        if ((existing?.total ?? 0) >= TASK_LOGS_PER_DAY_MAX) throw new ConflictException(`Maksimal ${TASK_LOGS_PER_DAY_MAX} catatan tugas per hari`);

        await tx.insert(taskLogs).values({
          id,
          tenantId: ctx.tenantId,
          employeeId: employee.id,
          workDate: input.workDate,
          indicatorId: input.indicatorId,
          quantity: input.quantity,
          note: input.note,
          photoKey: key,
          photoType: photo?.contentType ?? null,
          photoSize: photo ? photo.buffer.length : null,
          createdByUserId: user.userId,
        });

        // Upload terakhir di transaksi: gagal → baris ikut batal
        if (photo && key) {
          await this.putPhoto(key, photo);
          uploaded = true;
        }
        return toTaskLog(await this.requireLog(tx, employee.id, id), true);
      });
    } catch (error: unknown) {
      // Commit gagal setelah upload → file yatim dihapus (best effort)
      if (uploaded && key) await this.removeQuietly(key, "create");
      throw this.mapConstraint(error);
    }
  }

  // Ubah isi catatan (tanggal tetap). Foto baru menggantikan foto lama; removePhoto menghapus foto tanpa pengganti.
  async update(user: AuthUser, id: string, input: TaskLogUpdateInput, file: UploadedPhoto | null): Promise<TaskLog> {
    const photo = file ? this.inspectPhoto(file) : null;
    const ctx = tenantContextOf(user);
    const key = photo ? this.photoKey(ctx.tenantId, id, photo.contentType) : null;
    let uploaded = false;

    try {
      const result = await withTenant(this.db, ctx, async (tx) => {
        const { employee, row } = await this.lockEditable(tx, user, id);
        await this.assertIndicator(tx, employee.id, input);

        const replacePhoto = photo !== null || input.removePhoto;
        await tx
          .update(taskLogs)
          .set({
            indicatorId: input.indicatorId,
            quantity: input.quantity,
            note: input.note,
            editedAt: new Date(),
            ...(replacePhoto ? { photoKey: key, photoType: photo?.contentType ?? null, photoSize: photo ? photo.buffer.length : null } : {}),
          })
          .where(eq(taskLogs.id, id));

        if (photo && key) {
          await this.putPhoto(key, photo);
          uploaded = true;
        }
        return { log: toTaskLog(await this.requireLog(tx, employee.id, id), true), oldKey: replacePhoto ? row.photoKey : null };
      });
      // Foto lama dihapus setelah commit — gagal hanya meninggalkan file yatim
      if (result.oldKey) await this.removeQuietly(result.oldKey, "update");
      return result.log;
    } catch (error: unknown) {
      if (uploaded && key) await this.removeQuietly(key, "update");
      throw this.mapConstraint(error);
    }
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    const photoKey = await withTenant(this.db, ctx, async (tx) => {
      const { row } = await this.lockEditable(tx, user, id);
      await tx.delete(taskLogs).where(eq(taskLogs.id, id));
      return row.photoKey;
    });
    if (photoKey) await this.removeQuietly(photoKey, "remove");
  }

  // Foto bukti: pemilik catatan, atasan langsungnya, owner/admin
  async photo(user: AuthUser, id: string): Promise<PhotoFile> {
    const ctx = tenantContextOf(user);
    const found = await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({ key: taskLogs.photoKey, contentType: taskLogs.photoType, employeeUserId: employees.userId, supervisorId: employees.supervisorId })
        .from(taskLogs)
        .innerJoin(employees, eq(employees.id, taskLogs.employeeId))
        .where(eq(taskLogs.id, id));
      if (!row) throw new NotFoundException(NOT_FOUND);
      if (row.employeeUserId !== user.userId) {
        const viewer = await loadAttendanceViewer(tx, ctx);
        if (!viewer || !viewerCanSee(viewer, row.supervisorId)) throw new NotFoundException(NOT_FOUND);
      }
      if (!row.key || !row.contentType) throw new NotFoundException("Catatan ini tidak memiliki foto");
      return { key: row.key, contentType: row.contentType };
    });

    try {
      return { buffer: await this.storage.get(found.key), contentType: found.contentType };
    } catch (error: unknown) {
      this.logger.error(`[tasks/photo] ${id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Foto tidak dapat dibuka saat ini. Coba lagi nanti.");
    }
  }

  // ——— helper ———

  // Template KPI jabatan karyawan saat ini + indikator yang dicatat karyawan (angka/jumlah), urut seperti di template
  private async currentTemplate(tx: Transaction, employeeId: string): Promise<CurrentTemplate | null> {
    const [template] = await tx
      .select({ id: kpiTemplates.id, name: kpiTemplates.name })
      .from(employees)
      .innerJoin(positions, eq(positions.id, employees.positionId))
      .innerJoin(kpiTemplates, eq(kpiTemplates.id, positions.kpiTemplateId))
      .where(eq(employees.id, employeeId));
    if (!template) return null;

    const rows = await tx
      .select({
        id: kpiIndicators.id,
        name: kpiIndicators.name,
        type: kpiIndicators.type,
        unit: kpiIndicators.unit,
        target: kpiIndicators.target,
        targetPeriod: kpiIndicators.targetPeriod,
      })
      .from(kpiIndicators)
      .where(and(eq(kpiIndicators.templateId, template.id), inArray(kpiIndicators.type, [...LOGGABLE_KPI_INDICATOR_TYPES])))
      .orderBy(asc(kpiIndicators.sortOrder));
    const indicators = rows.flatMap((row): LoggableIndicator[] =>
      // CHECK kpi_indicators_type_fields menjamin unit & target_period terisi untuk numeric/count
      isLoggableType(row.type) && row.unit !== null && row.targetPeriod !== null
        ? [{ id: row.id, name: row.name, type: row.type, unit: row.unit, target: trimDecimal(row.target), targetPeriod: row.targetPeriod }]
        : [],
    );
    return { ...template, indicators };
  }

  private async assertIndicator(tx: Transaction, employeeId: string, input: { indicatorId: string | null; quantity: string | null }): Promise<void> {
    if (!input.indicatorId) return;
    const template = await this.currentTemplate(tx, employeeId);
    const indicator = template?.indicators.find((candidate) => candidate.id === input.indicatorId);
    if (!indicator) throw new BadRequestException(UNKNOWN_INDICATOR);
    if (indicator.type === "count" && input.quantity !== null && !isWholeQuantity(input.quantity)) {
      throw new BadRequestException(`Realisasi "${indicator.name}" berupa bilangan bulat`);
    }
  }

  private async logsOf(tx: Transaction, employeeId: string, date: string): Promise<LogRow[]> {
    return tx
      .select(logColumns)
      .from(taskLogs)
      .leftJoin(kpiIndicators, eq(kpiIndicators.id, taskLogs.indicatorId))
      .where(and(eq(taskLogs.employeeId, employeeId), eq(taskLogs.workDate, date)))
      .orderBy(desc(taskLogs.createdAt));
  }

  private async requireLog(tx: Transaction, employeeId: string, id: string): Promise<LogRow> {
    const [row] = await tx
      .select(logColumns)
      .from(taskLogs)
      .leftJoin(kpiIndicators, eq(kpiIndicators.id, taskLogs.indicatorId))
      .where(and(eq(taskLogs.id, id), eq(taskLogs.employeeId, employeeId)));
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }

  // Catatan milik sendiri, dikunci untuk diubah/dihapus: masih menunggu verifikasi & tanggalnya di jendela catat
  private async lockEditable(
    tx: Transaction,
    user: AuthUser,
    id: string,
  ): Promise<{ employee: { id: string }; row: { status: TaskLogStatus; workDate: string; photoKey: string | null } }> {
    const timeZone = await this.attendance.tenantTimeZone(tx, tenantContextOf(user).tenantId);
    const today = localClock(new Date(), timeZone).date;
    const employee = await this.attendance.requireEmployee(tx, user.userId, today);
    const [row] = await tx
      .select({ status: taskLogs.status, workDate: taskLogs.workDate, photoKey: taskLogs.photoKey })
      .from(taskLogs)
      .where(and(eq(taskLogs.id, id), eq(taskLogs.employeeId, employee.id)))
      .for("update");
    if (!row) throw new NotFoundException(NOT_FOUND);
    if (row.status !== "pending") throw new ConflictException("Catatan ini sudah diverifikasi atasan dan tidak bisa diubah");
    if (!isTaskLogEditable(row.status, row.workDate, earliestLogDate(today, employee.joinDate), today)) {
      throw new ConflictException(`Catatan lebih dari ${TASK_LOG_BACKDATE_DAYS} hari yang lalu tidak bisa diubah lagi`);
    }
    return { employee, row };
  }

  private inspectPhoto(file: UploadedPhoto): PhotoFile {
    if (file.size === 0) throw new BadRequestException("File foto kosong");
    const contentType = detectTaskPhotoType(file.buffer);
    if (!contentType) throw new BadRequestException("Foto harus berupa JPG, PNG, atau WebP");
    return { buffer: file.buffer, contentType };
  }

  private photoKey(tenantId: string, logId: string, contentType: TaskPhotoType): string {
    return tenantFileKey(tenantId, "task-logs", logId, `${randomUUID()}.${TASK_PHOTO_EXTENSIONS[contentType]}`);
  }

  private async putPhoto(key: string, photo: PhotoFile): Promise<void> {
    try {
      await this.storage.put(key, photo.buffer, photo.contentType);
    } catch {
      // Detail sudah di-log FileStorage
      throw new ServiceUnavailableException("Foto gagal diunggah. Coba lagi, atau simpan catatan tanpa foto.");
    }
  }

  private async removeQuietly(key: string, action: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch {
      this.logger.warn(`[tasks/${action}] file yatim tidak terhapus: ${key}`);
    }
  }

  // Pelanggaran FK dari kiriman bersamaan (mis. indikator baru saja dihapus) → pesan yang bisa ditindaklanjuti
  private mapConstraint(error: unknown): unknown {
    const constraint = foreignKeyViolationConstraint(error);
    if (constraint === "task_logs_attendance_fk") return new ConflictException(NOT_CHECKED_IN);
    if (constraint === "task_logs_indicator_fk") return new BadRequestException(UNKNOWN_INDICATOR);
    return error;
  }
}
