import { employees, kpiIndicators, positions, taskLogs, users } from "@exapay/db";
import {
  TASK_LOG_STATUS_LABELS,
  TASK_VERIFICATION_PAGE_SIZE,
  type TaskBulkApproveInput,
  type TaskBulkApproveResult,
  type TaskDecision,
  type TaskDecisionData,
  type TaskLogStatus,
  type TaskVerificationItem,
  type TaskVerificationList,
  type TaskVerificationQuery,
  trimDecimal,
} from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { type AttendanceViewer, loadAttendanceViewer, viewerCanSee, viewerEmployeeScope } from "../attendance/attendance-viewer.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { AuditService } from "../audit/audit.service.js";
import { isWholeQuantity } from "./task-log-rules.js";
import { isLoggableType, taskLogFields } from "./task-logs.service.js";

const NOT_FOUND = "Catatan tugas tidak ditemukan";
const CHANGED = "Catatan ini baru saja diubah karyawan. Muat ulang halaman lalu periksa lagi.";

// Versi isi catatan = mikrodetik epoch updated_at (presisi penuh Postgres; Date JS hanya milidetik)
const versionOf = sql<string>`(extract(epoch from ${taskLogs.updatedAt}) * 1000000)::bigint::text`;

const itemColumns = {
  id: taskLogs.id,
  workDate: taskLogs.workDate,
  indicatorId: taskLogs.indicatorId,
  indicatorName: kpiIndicators.name,
  indicatorType: kpiIndicators.type,
  indicatorUnit: kpiIndicators.unit,
  indicatorTarget: kpiIndicators.target,
  indicatorTargetPeriod: kpiIndicators.targetPeriod,
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
  version: versionOf,
  employeeId: taskLogs.employeeId,
  employeeName: employees.fullName,
  positionName: positions.name,
};

// Baris yang dikunci untuk diputuskan
type LockedLog = {
  id: string;
  employeeId: string;
  supervisorId: string | null;
  status: TaskLogStatus;
  indicatorId: string | null;
  indicatorType: string | null;
  quantity: string | null;
  version: string;
};

type Decided = { status: "approved" | "rejected"; verifiedQuantity: string | null; note: string | null };

// Verifikasi catatan tugas harian (feature 20, /kpi/verification). Atasan langsung (peran atasan, supervisor_id) atau
// owner/admin memutuskan; tidak ada yang memverifikasi catatannya sendiri. Keputusan final: setujui, tolak (beralasan),
// koreksi angka (beralasan — disetujui dengan realisasi yang diakui berbeda). Setiap keputusan diaudit (task_log).
@Injectable()
export class TaskVerificationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: TaskVerificationQuery): Promise<TaskVerificationList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const scope = viewerEmployeeScope(viewer);
      const statusCondition = query.status === "all" ? undefined : eq(taskLogs.status, query.status);
      const where = and(scope, statusCondition);

      const [totalRow] = await tx.select({ total: count() }).from(taskLogs).innerJoin(employees, eq(employees.id, taskLogs.employeeId)).where(where);
      const [pendingRow] = await tx
        .select({ total: count() })
        .from(taskLogs)
        .innerJoin(employees, eq(employees.id, taskLogs.employeeId))
        .where(and(scope, eq(taskLogs.status, "pending")));

      // Dikelompokkan per karyawan + tanggal di UI → urutan menjaga satu kelompok tetap berurutan.
      // Menunggu: tanggal kerja terlama dulu (paling lama menunggu); selainnya terbaru dulu.
      const dateOrder = query.status === "pending" ? asc(taskLogs.workDate) : desc(taskLogs.workDate);
      const rows = await tx
        .select(itemColumns)
        .from(taskLogs)
        .innerJoin(employees, eq(employees.id, taskLogs.employeeId))
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .leftJoin(kpiIndicators, eq(kpiIndicators.id, taskLogs.indicatorId))
        .where(where)
        .orderBy(dateOrder, asc(employees.fullName), asc(taskLogs.employeeId), asc(taskLogs.createdAt))
        .limit(TASK_VERIFICATION_PAGE_SIZE)
        .offset((query.page - 1) * TASK_VERIFICATION_PAGE_SIZE);

      const items: TaskVerificationItem[] = rows.map((row) => ({
        ...taskLogFields(row),
        indicator:
          // CHECK kpi_indicators_type_fields menjamin unit & target_period terisi untuk numeric/count
          row.indicatorId && row.indicatorName && isLoggableType(row.indicatorType) && row.indicatorTarget !== null && row.indicatorTargetPeriod !== null
            ? {
                id: row.indicatorId,
                name: row.indicatorName,
                type: row.indicatorType,
                unit: row.indicatorUnit ?? "",
                target: trimDecimal(row.indicatorTarget),
                targetPeriod: row.indicatorTargetPeriod,
              }
            : null,
        employee: { id: row.employeeId, fullName: row.employeeName, positionName: row.positionName },
        version: row.version,
        canDecide: row.status === "pending" && row.employeeId !== viewer.ownEmployeeId,
      }));
      return {
        items,
        total: totalRow?.total ?? 0,
        page: query.page,
        pageSize: TASK_VERIFICATION_PAGE_SIZE,
        pendingCount: pendingRow?.total ?? 0,
        scope: viewer.manage ? "all" : "subordinates",
        timeZone: await this.attendance.tenantTimeZone(tx, ctx.tenantId),
      };
    });
  }

  async decide(user: AuthUser, id: string, input: TaskDecisionData): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const [row] = await this.lockLogs(tx, [id]);
      if (!row || !viewerCanSee(viewer, row.supervisorId)) throw new NotFoundException(NOT_FOUND);
      if (row.employeeId === viewer.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat memverifikasi catatan tugas Anda sendiri");
      if (row.status !== "pending") throw new ConflictException(`Catatan ini sudah ${TASK_LOG_STATUS_LABELS[row.status].toLowerCase()}`);
      if (row.version !== input.version) throw new ConflictException(CHANGED);

      const note = input.note.length > 0 ? input.note : null;
      await this.apply(tx, ctx, user, row, input.decision, this.outcomeOf(row, input, note));
    });
  }

  // Setujui sekaligus. Catatan yang sudah diputuskan, dihapus, atau diubah karyawan sejak dibaca dilewati (bukan error).
  async bulkApprove(user: AuthUser, input: TaskBulkApproveInput): Promise<TaskBulkApproveResult> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const rows = await this.lockLogs(tx, input.items.map((item) => item.id));
      if (rows.some((row) => !viewerCanSee(viewer, row.supervisorId))) throw new NotFoundException(NOT_FOUND);
      if (rows.some((row) => row.employeeId === viewer.ownEmployeeId)) throw new ForbiddenException("Anda tidak dapat memverifikasi catatan tugas Anda sendiri");

      const byId = new Map(rows.map((row) => [row.id, row]));
      let approved = 0;
      for (const item of input.items) {
        const row = byId.get(item.id);
        if (!row || row.status !== "pending" || row.version !== item.version) continue;
        await this.apply(tx, ctx, user, row, "approve", { status: "approved", verifiedQuantity: row.indicatorId ? row.quantity : null, note: null });
        approved += 1;
      }
      return { approved, skipped: input.items.length - approved };
    });
  }

  // ——— helper ———

  private outcomeOf(row: LockedLog, input: TaskDecisionData, note: string | null): Decided {
    if (input.decision === "reject") return { status: "rejected", verifiedQuantity: null, note };
    if (input.decision === "approve") return { status: "approved", verifiedQuantity: row.indicatorId ? row.quantity : null, note };

    if (!row.indicatorId || row.quantity === null || input.quantity === null) throw new BadRequestException("Pekerjaan lain tidak memiliki angka untuk dikoreksi");
    if (row.indicatorType === "count" && !isWholeQuantity(input.quantity)) throw new BadRequestException("Realisasi indikator jumlah berupa bilangan bulat");
    if (trimDecimal(input.quantity) === trimDecimal(row.quantity)) throw new BadRequestException("Angka koreksi sama dengan angka karyawan — pilih Setujui");
    return { status: "approved", verifiedQuantity: input.quantity, note };
  }

  private async apply(tx: Transaction, ctx: TenantContext, user: AuthUser, row: LockedLog, decision: TaskDecision, outcome: Decided): Promise<void> {
    const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
    await tx
      .update(taskLogs)
      .set({
        status: outcome.status,
        verifiedQuantity: outcome.verifiedQuantity,
        decidedAt: new Date(),
        decidedByUserId: user.userId,
        decidedByName: actor?.fullName ?? null,
        decisionNote: outcome.note,
      })
      .where(eq(taskLogs.id, row.id));

    await this.audit.record(tx, ctx, {
      entity: "task_log",
      entityId: row.id,
      action: decision,
      before: { status: "pending", quantity: row.quantity === null ? null : trimDecimal(row.quantity) },
      after: { status: outcome.status, verifiedQuantity: outcome.verifiedQuantity === null ? null : trimDecimal(outcome.verifiedQuantity), note: outcome.note },
    });
  }

  // Kunci baris catatan (bukan karyawan/indikator) — ubah/hapus karyawan yang bersamaan menunggu keputusan selesai
  private async lockLogs(tx: Transaction, ids: string[]): Promise<LockedLog[]> {
    return tx
      .select({
        id: taskLogs.id,
        employeeId: taskLogs.employeeId,
        supervisorId: employees.supervisorId,
        status: taskLogs.status,
        indicatorId: taskLogs.indicatorId,
        indicatorType: kpiIndicators.type,
        quantity: taskLogs.quantity,
        version: versionOf,
      })
      .from(taskLogs)
      .innerJoin(employees, eq(employees.id, taskLogs.employeeId))
      .leftJoin(kpiIndicators, eq(kpiIndicators.id, taskLogs.indicatorId))
      .where(inArray(taskLogs.id, ids))
      .for("update", { of: taskLogs });
  }

  private async requireViewer(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke verifikasi tugas");
    return viewer;
  }
}
