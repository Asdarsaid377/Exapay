import { randomUUID } from "node:crypto";

import { employees, leaveRequests, memberships, positions, users } from "@exapay/db";
import {
  type LeaveAttachmentType,
  type LeaveDecisionData,
  type LeaveRequest,
  type LeaveRequestInput,
  type LeaveRequestList,
  type LeaveRequestListItem,
  type LeaveRequestListQuery,
  LEAVE_REQUEST_STATUS_LABELS,
  LEAVE_REQUESTS_PAGE_SIZE,
  type LeaveRequestStatus,
  type LeaveType,
  type MembershipRole,
  type MyLeaveRequests,
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
import { and, asc, count, desc, eq, gte, lte, or, type SQL, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { exclusionViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { FileStorage, tenantFileKey } from "../storage/file-storage.js";
import { localClock, monthRange } from "./attendance-clock.js";
import { AttendanceService } from "./attendance.service.js";
import { ATTACHMENT_EXTENSIONS, detectAttachmentType, safeAttachmentName } from "./leave-attachment.js";
import { countWorkingDays, type WorkCalendar, workingDatesBetween } from "./work-calendar.js";
import { WorkCalendarService } from "./work-calendar.service.js";

// Bagian file multipart yang dipakai (multer memory storage)
export type UploadedAttachment = { buffer: Buffer; size: number; originalname: string };

export type AttachmentFile = { buffer: Buffer; name: string; contentType: LeaveAttachmentType };

// Penglihat halaman persetujuan: owner/admin → semua; atasan → bawahan langsung (supervisor_id = data karyawan miliknya)
type Viewer = { role: MembershipRole; manage: boolean; ownEmployeeId: string | null };

const NOT_FOUND = "Pengajuan tidak ditemukan";
const OVERLAP = "Tanggal tersebut sudah tercakup pengajuan lain yang menunggu atau disetujui";

const requestColumns = {
  id: leaveRequests.id,
  employeeId: leaveRequests.employeeId,
  type: leaveRequests.type,
  startDate: leaveRequests.startDate,
  endDate: leaveRequests.endDate,
  reason: leaveRequests.reason,
  status: leaveRequests.status,
  attachmentName: leaveRequests.attachmentName,
  attachmentType: leaveRequests.attachmentType,
  attachmentSize: leaveRequests.attachmentSize,
  createdAt: leaveRequests.createdAt,
  decidedAt: leaveRequests.decidedAt,
  decidedByName: leaveRequests.decidedByName,
  decisionNote: leaveRequests.decisionNote,
};

type RequestRow = {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveRequestStatus;
  attachmentName: string | null;
  attachmentType: LeaveAttachmentType | null;
  attachmentSize: number | null;
  createdAt: Date;
  decidedAt: Date | null;
  decidedByName: string | null;
  decisionNote: string | null;
};

function toLeaveRequest(row: RequestRow, calendar: WorkCalendar | null): LeaveRequest {
  return {
    id: row.id,
    type: row.type,
    startDate: row.startDate,
    endDate: row.endDate,
    workingDays: calendar ? countWorkingDays(calendar, row.startDate, row.endDate) : 0,
    reason: row.reason,
    status: row.status,
    attachment:
      row.attachmentName && row.attachmentType && row.attachmentSize !== null
        ? { name: row.attachmentName, contentType: row.attachmentType, size: row.attachmentSize }
        : null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decidedByName: row.decidedByName,
    decisionNote: row.decisionNote,
  };
}

// Pengajuan izin/sakit/cuti (feature 15). Karyawan mengajukan untuk dirinya sendiri (akun tertaut data karyawan aktif);
// atasan langsung atau owner/admin memutuskan. Tidak ada yang memutuskan pengajuan miliknya sendiri.
@Injectable()
export class LeaveRequestsService {
  private readonly logger = new Logger(LeaveRequestsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly workCalendar: WorkCalendarService,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
  ) {}

  // ——— Portal /me/attendance ———

  async mine(user: AuthUser, month: string | undefined): Promise<MyLeaveRequests> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
      const today = localClock(new Date(), timeZone).date;
      const selected = month ?? today.slice(0, 7);
      const { from, to } = monthRange(selected);
      const employee = await this.attendance.ownEmployee(tx, user.userId);
      const access = this.attendance.accessOf(employee, today);
      if (!employee) return { access, today, month: selected, requests: [], leaveDays: [], summary: { permit: 0, sick: 0, leave: 0 } };

      const overlapsMonth = and(lte(leaveRequests.startDate, to), gte(leaveRequests.endDate, from));
      const rows = await tx
        .select(requestColumns)
        .from(leaveRequests)
        .where(and(eq(leaveRequests.employeeId, employee.id), or(eq(leaveRequests.status, "pending"), gte(leaveRequests.endDate, today), overlapsMonth)))
        .orderBy(desc(leaveRequests.startDate), desc(leaveRequests.createdAt))
        .limit(100);
      const approvedInMonth = await tx
        .select({ type: leaveRequests.type, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.employeeId, employee.id), eq(leaveRequests.status, "approved"), overlapsMonth));

      const calendar = await this.calendarFor(tx, rows, { from, to });
      const leaveDays = approvedInMonth
        .flatMap((leave) =>
          workingDatesBetween(calendar, leave.startDate < from ? from : leave.startDate, leave.endDate > to ? to : leave.endDate).map((date) => ({
            date,
            type: leave.type,
          })),
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      const summary = { permit: 0, sick: 0, leave: 0 };
      for (const day of leaveDays) summary[day.type] += 1;

      return { access, today, month: selected, requests: rows.map((row) => toLeaveRequest(row, calendar)), leaveDays, summary };
    });
  }

  async create(user: AuthUser, input: LeaveRequestInput, file: UploadedAttachment | null): Promise<LeaveRequest> {
    const attachment = file ? this.inspectAttachment(file) : null;
    const ctx = tenantContextOf(user);
    const id = randomUUID();
    const key = attachment ? tenantFileKey(ctx.tenantId, "leave-requests", id, `${randomUUID()}.${ATTACHMENT_EXTENSIONS[attachment.contentType]}`) : null;
    let uploaded = false;

    try {
      return await withTenant(this.db, ctx, async (tx) => {
        const timeZone = await this.attendance.tenantTimeZone(tx, ctx.tenantId);
        const today = localClock(new Date(), timeZone).date;
        const employee = await this.attendance.requireEmployee(tx, user.userId, today);
        if (input.startDate < employee.joinDate) throw new BadRequestException("Tanggal mulai tidak boleh sebelum tanggal masuk kerja Anda");

        const calendar = await this.workCalendar.loadCalendar(tx, input.startDate, input.endDate);
        if (countWorkingDays(calendar, input.startDate, input.endDate) === 0)
          throw new BadRequestException("Rentang tanggal tidak berisi hari kerja — tidak perlu mengajukan untuk hari libur");

        const [row] = await tx
          .insert(leaveRequests)
          .values({
            id,
            tenantId: ctx.tenantId,
            employeeId: employee.id,
            type: input.type,
            startDate: input.startDate,
            endDate: input.endDate,
            reason: input.reason,
            attachmentKey: key,
            attachmentName: attachment?.name ?? null,
            attachmentType: attachment?.contentType ?? null,
            attachmentSize: attachment ? attachment.buffer.length : null,
            requestedByUserId: user.userId,
          })
          .returning(requestColumns);
        if (!row) throw new Error("[leave-requests/create] insert tidak mengembalikan baris");

        // Upload terakhir di transaksi: gagal → baris ikut batal. Baris gagal (mis. tanggal beririsan) → file tidak pernah diunggah.
        if (attachment && key) {
          await this.putAttachment(key, attachment);
          uploaded = true;
        }
        return toLeaveRequest(row, calendar);
      });
    } catch (error: unknown) {
      // Commit gagal setelah upload → file yatim dihapus (best effort)
      if (uploaded && key) await this.removeQuietly(key);
      if (exclusionViolationConstraint(error) === "leave_requests_no_overlap") throw new ConflictException(OVERLAP);
      throw error;
    }
  }

  // Batalkan pengajuan milik sendiri selama masih menunggu (akun tertaut, walau data karyawan sudah nonaktif)
  async cancel(user: AuthUser, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const employee = await this.attendance.ownEmployee(tx, user.userId);
      if (!employee) throw new NotFoundException(NOT_FOUND);
      const [row] = await tx
        .update(leaveRequests)
        .set({ status: "cancelled", cancelledAt: new Date() })
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.employeeId, employee.id), eq(leaveRequests.status, "pending")))
        .returning({ id: leaveRequests.id });
      if (row) return;

      const [existing] = await tx
        .select({ status: leaveRequests.status })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.employeeId, employee.id)));
      if (!existing) throw new NotFoundException(NOT_FOUND);
      throw new ConflictException(`Pengajuan ini sudah ${LEAVE_REQUEST_STATUS_LABELS[existing.status].toLowerCase()} dan tidak bisa dibatalkan`);
    });
  }

  // ——— Persetujuan /attendance/requests ———

  async list(user: AuthUser, query: LeaveRequestListQuery): Promise<LeaveRequestList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const scope = this.scopeCondition(viewer);
      const statusCondition = query.status === "all" ? undefined : eq(leaveRequests.status, query.status);
      const where = and(scope, statusCondition);

      const [totalRow] = await tx.select({ total: count() }).from(leaveRequests).innerJoin(employees, eq(employees.id, leaveRequests.employeeId)).where(where);
      const [pendingRow] = await tx
        .select({ total: count() })
        .from(leaveRequests)
        .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .where(and(scope, eq(leaveRequests.status, "pending")));

      // Menunggu: yang paling dulu dimulai di atas (paling mendesak); selainnya terbaru di atas
      const order = query.status === "pending" ? [asc(leaveRequests.startDate), asc(leaveRequests.createdAt)] : [desc(leaveRequests.createdAt)];
      const rows = await tx
        .select({ ...requestColumns, employeeName: employees.fullName, positionName: positions.name })
        .from(leaveRequests)
        .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .where(where)
        .orderBy(...order)
        .limit(LEAVE_REQUESTS_PAGE_SIZE)
        .offset((query.page - 1) * LEAVE_REQUESTS_PAGE_SIZE);

      const calendar = rows.length > 0 ? await this.calendarFor(tx, rows, null) : null;
      const items: LeaveRequestListItem[] = rows.map((row) => ({
        ...toLeaveRequest(row, calendar),
        employee: { id: row.employeeId, fullName: row.employeeName, positionName: row.positionName },
        canDecide: row.status === "pending" && row.employeeId !== viewer.ownEmployeeId,
      }));
      return {
        items,
        total: totalRow?.total ?? 0,
        page: query.page,
        pageSize: LEAVE_REQUESTS_PAGE_SIZE,
        pendingCount: pendingRow?.total ?? 0,
        scope: viewer.manage ? "all" : "subordinates",
      };
    });
  }

  async decide(user: AuthUser, id: string, input: LeaveDecisionData): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const [row] = await tx
        .select({ status: leaveRequests.status, employeeId: leaveRequests.employeeId, supervisorId: employees.supervisorId })
        .from(leaveRequests)
        .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .where(eq(leaveRequests.id, id));
      if (!row || !this.inScope(viewer, row.supervisorId)) throw new NotFoundException(NOT_FOUND);
      if (row.employeeId === viewer.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat memutuskan pengajuan Anda sendiri");
      if (row.status !== "pending") throw new ConflictException(`Pengajuan ini sudah ${LEAVE_REQUEST_STATUS_LABELS[row.status].toLowerCase()}`);

      const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
      const status = input.decision === "approve" ? "approved" : "rejected";
      const note = input.note.length > 0 ? input.note : null;
      const [updated] = await tx
        .update(leaveRequests)
        .set({ status, decidedAt: new Date(), decidedByUserId: user.userId, decidedByName: actor?.fullName ?? null, decisionNote: note })
        // Dua pemutus bersamaan: hanya yang pertama menang
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, "pending")))
        .returning({ id: leaveRequests.id });
      if (!updated) throw new ConflictException("Pengajuan ini baru saja diputuskan orang lain");

      await this.audit.record(tx, ctx, {
        entity: "leave_request",
        entityId: id,
        action: input.decision,
        before: { status: "pending" },
        after: { status, note },
      });
    });
  }

  // ——— Lampiran: pemilik pengajuan, atasan langsungnya, owner/admin ———

  async attachment(user: AuthUser, id: string): Promise<AttachmentFile> {
    const ctx = tenantContextOf(user);
    const found = await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .select({
          key: leaveRequests.attachmentKey,
          name: leaveRequests.attachmentName,
          contentType: leaveRequests.attachmentType,
          employeeUserId: employees.userId,
          supervisorId: employees.supervisorId,
        })
        .from(leaveRequests)
        .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .where(eq(leaveRequests.id, id));
      if (!row) throw new NotFoundException(NOT_FOUND);
      if (row.employeeUserId !== user.userId) {
        const viewer = await this.viewer(tx, ctx);
        if (!viewer || !this.inScope(viewer, row.supervisorId)) throw new NotFoundException(NOT_FOUND);
      }
      if (!row.key || !row.name || !row.contentType) throw new NotFoundException("Pengajuan ini tidak memiliki lampiran");
      return { key: row.key, name: row.name, contentType: row.contentType };
    });

    try {
      return { buffer: await this.storage.get(found.key), name: found.name, contentType: found.contentType };
    } catch (error: unknown) {
      this.logger.error(`[leave-requests/attachment] ${id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException("Lampiran tidak dapat dibuka saat ini. Coba lagi nanti.");
    }
  }

  // ——— helper ———

  private inspectAttachment(file: UploadedAttachment): AttachmentFile {
    if (file.size === 0) throw new BadRequestException("File lampiran kosong");
    const contentType = detectAttachmentType(file.buffer);
    if (!contentType) throw new BadRequestException("Lampiran harus berupa PDF, JPG, atau PNG");
    return { buffer: file.buffer, contentType, name: safeAttachmentName(file.originalname, contentType) };
  }

  private async putAttachment(key: string, attachment: AttachmentFile): Promise<void> {
    try {
      await this.storage.put(key, attachment.buffer, attachment.contentType);
    } catch {
      // Detail sudah di-log FileStorage
      throw new ServiceUnavailableException("Lampiran gagal diunggah. Coba lagi, atau kirim pengajuan tanpa lampiran.");
    }
  }

  private async removeQuietly(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch {
      this.logger.warn(`[leave-requests/create] file yatim tidak terhapus: ${key}`);
    }
  }

  // Kalender kerja yang mencakup semua pengajuan (+ rentang tambahan, mis. bulan terpilih)
  private async calendarFor(
    tx: Transaction,
    rows: readonly { startDate: string; endDate: string }[],
    extra: { from: string; to: string } | null,
  ): Promise<WorkCalendar> {
    let from = extra?.from ?? rows[0]?.startDate ?? "";
    let to = extra?.to ?? rows[0]?.endDate ?? "";
    for (const row of rows) {
      if (row.startDate < from) from = row.startDate;
      if (row.endDate > to) to = row.endDate;
    }
    return this.workCalendar.loadCalendar(tx, from, to);
  }

  // Peran dibaca ulang dari DB (klaim JWT bisa basi 15 menit). karyawan / bukan anggota → null.
  private async viewer(tx: Transaction, ctx: TenantContext): Promise<Viewer | null> {
    if (!ctx.userId) return null;
    // Filter tenant wajib: policy own_memberships_select juga memperlihatkan membership user di usaha lain
    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, ctx.userId)));
    if (!membership || membership.role === "karyawan") return null;
    const [own] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.userId, ctx.userId));
    return { role: membership.role, manage: membership.role === "owner" || membership.role === "admin", ownEmployeeId: own?.id ?? null };
  }

  private async requireViewer(tx: Transaction, ctx: TenantContext): Promise<Viewer> {
    const viewer = await this.viewer(tx, ctx);
    if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke pengajuan izin");
    return viewer;
  }

  // Atasan tanpa data karyawan tertaut tidak punya bawahan → tidak melihat apa pun
  private scopeCondition(viewer: Viewer): SQL | undefined {
    if (viewer.manage) return undefined;
    return viewer.ownEmployeeId ? eq(employees.supervisorId, viewer.ownEmployeeId) : sql`false`;
  }

  private inScope(viewer: Viewer, supervisorId: string | null): boolean {
    return viewer.manage || (viewer.ownEmployeeId !== null && supervisorId === viewer.ownEmployeeId);
  }
}
