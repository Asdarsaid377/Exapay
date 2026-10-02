import { attendanceRecords, attendanceReviews, employees, positions, users } from "@exapay/db";
import {
  ATTENDANCE_FLAG_KINDS,
  ATTENDANCE_REVIEWS_PAGE_SIZE,
  type AttendanceEvent,
  type AttendanceReviewDecision,
  type AttendanceReviewDecisionData,
  type AttendanceReviewItem,
  type AttendanceReviewList,
  type AttendanceReviewListQuery,
  type GeofenceStatus,
  isAttendanceFlag,
} from "@exapay/shared";
import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, between, eq, inArray, or } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { monthRange } from "./attendance-clock.js";
import { type AttendanceViewer, loadAttendanceViewer, viewerCanSee, viewerEmployeeScope } from "./attendance-viewer.js";
import { AttendanceService } from "./attendance.service.js";
import { WorkLocationsService } from "./work-locations.service.js";

const FLAGGED = [...ATTENDANCE_FLAG_KINDS];

type ReviewRow = {
  attendanceRecordId: string;
  event: AttendanceEvent;
  decision: AttendanceReviewDecision;
  note: string | null;
  reviewedByName: string | null;
  reviewedAt: Date;
};

// Tinjauan absen bertanda (feature 44, /attendance/review): satu item per absen masuk/pulang yang bertanda (di luar lokasi,
// lokasi tidak akurat, tanpa lokasi). Owner/admin semua karyawan; atasan bawahan langsung. Keputusan tidak mengubah jam/gaji —
// koreksi tetap lewat attendance_corrections. Tidak ada yang meninjau absensinya sendiri.
@Injectable()
export class AttendanceReviewsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly workLocations: WorkLocationsService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, query: AttendanceReviewListQuery): Promise<AttendanceReviewList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const flaggedRecord = or(inArray(attendanceRecords.checkInGeofence, FLAGGED), inArray(attendanceRecords.checkOutGeofence, FLAGGED));
      const range = query.month ? monthRange(query.month) : null;
      // Volume UMKM (< 50 karyawan) kecil: semua absen bertanda dalam cakupan dimuat, filter status & halaman di aplikasi
      const records = await tx
        .select({
          id: attendanceRecords.id,
          workDate: attendanceRecords.workDate,
          employeeId: employees.id,
          fullName: employees.fullName,
          positionName: positions.name,
          checkInAt: attendanceRecords.checkInAt,
          checkInAccuracy: attendanceRecords.checkInAccuracy,
          checkInGeofence: attendanceRecords.checkInGeofence,
          checkInDistanceM: attendanceRecords.checkInDistanceM,
          checkInLocationName: attendanceRecords.checkInLocationName,
          checkOutAt: attendanceRecords.checkOutAt,
          checkOutAccuracy: attendanceRecords.checkOutAccuracy,
          checkOutGeofence: attendanceRecords.checkOutGeofence,
          checkOutDistanceM: attendanceRecords.checkOutDistanceM,
          checkOutLocationName: attendanceRecords.checkOutLocationName,
        })
        .from(attendanceRecords)
        .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .where(and(flaggedRecord, viewerEmployeeScope(viewer), range ? between(attendanceRecords.workDate, range.from, range.to) : undefined));

      const reviews: ReviewRow[] =
        records.length === 0
          ? []
          : await tx
              .select({
                attendanceRecordId: attendanceReviews.attendanceRecordId,
                event: attendanceReviews.event,
                decision: attendanceReviews.decision,
                note: attendanceReviews.note,
                reviewedByName: attendanceReviews.reviewedByName,
                reviewedAt: attendanceReviews.reviewedAt,
              })
              .from(attendanceReviews)
              .where(
                inArray(
                  attendanceReviews.attendanceRecordId,
                  records.map((r) => r.id),
                ),
              );
      const reviewOf = (recordId: string, event: AttendanceEvent): AttendanceReviewItem["review"] => {
        const row = reviews.find((r) => r.attendanceRecordId === recordId && r.event === event);
        return row ? { decision: row.decision, note: row.note, reviewedByName: row.reviewedByName, reviewedAt: row.reviewedAt.toISOString() } : null;
      };

      const items: AttendanceReviewItem[] = [];
      for (const record of records) {
        const employee = { id: record.employeeId, fullName: record.fullName, positionName: record.positionName };
        const canReview = record.employeeId !== viewer.ownEmployeeId;
        const sides = [
          { event: "check_in", at: record.checkInAt, status: record.checkInGeofence, distanceM: record.checkInDistanceM, locationName: record.checkInLocationName, accuracyM: record.checkInAccuracy },
          { event: "check_out", at: record.checkOutAt, status: record.checkOutGeofence, distanceM: record.checkOutDistanceM, locationName: record.checkOutLocationName, accuracyM: record.checkOutAccuracy },
        ] as const;
        for (const side of sides) {
          if (!side.at || !isAttendanceFlag(side.status)) continue;
          items.push({
            recordId: record.id,
            event: side.event,
            employee,
            workDate: record.workDate,
            at: side.at.toISOString(),
            flag: { kind: side.status, distanceM: side.distanceM, locationName: side.locationName, accuracyM: side.accuracyM },
            review: reviewOf(record.id, side.event),
            canReview,
          });
        }
      }

      const byFlag = query.flag === "all" ? items : items.filter((item) => item.flag.kind === query.flag);
      const filtered = byFlag.filter((item) => (query.status === "all" ? true : query.status === "pending" ? item.review === null : item.review !== null));
      // Terbaru di atas
      filtered.sort((a, b) => b.at.localeCompare(a.at));
      return {
        items: filtered.slice((query.page - 1) * ATTENDANCE_REVIEWS_PAGE_SIZE, query.page * ATTENDANCE_REVIEWS_PAGE_SIZE),
        total: filtered.length,
        page: query.page,
        pageSize: ATTENDANCE_REVIEWS_PAGE_SIZE,
        pendingCount: byFlag.filter((item) => item.review === null).length,
        timeZone: await this.attendance.tenantTimeZone(tx, ctx.tenantId),
        hasLocations: await this.workLocations.hasLocations(tx),
      };
    });
  }

  // Keputusan boleh diubah (baris yang sama diperbarui); setiap keputusan tercatat di audit log dari → ke.
  async decide(user: AuthUser, recordId: string, event: AttendanceEvent, input: AttendanceReviewDecisionData): Promise<void> {
    const ctx = tenantContextOf(user);
    const now = new Date();
    await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const [record] = await tx
        .select({
          id: attendanceRecords.id,
          employeeId: attendanceRecords.employeeId,
          workDate: attendanceRecords.workDate,
          supervisorId: employees.supervisorId,
          checkInGeofence: attendanceRecords.checkInGeofence,
          checkOutGeofence: attendanceRecords.checkOutGeofence,
        })
        .from(attendanceRecords)
        .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
        .where(eq(attendanceRecords.id, recordId));
      if (!record || !viewerCanSee(viewer, record.supervisorId)) throw new NotFoundException("Absen tidak ditemukan");
      if (record.employeeId === viewer.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat meninjau absensi Anda sendiri");
      const status: GeofenceStatus | null = event === "check_in" ? record.checkInGeofence : record.checkOutGeofence;
      if (!isAttendanceFlag(status)) throw new ConflictException("Absen ini tidak bertanda — tidak perlu ditinjau. Muat ulang halaman.");

      const [before] = await tx
        .select({ decision: attendanceReviews.decision, note: attendanceReviews.note })
        .from(attendanceReviews)
        .where(and(eq(attendanceReviews.attendanceRecordId, record.id), eq(attendanceReviews.event, event)))
        .for("update");
      const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
      const values = {
        decision: input.decision,
        note: input.note.length > 0 ? input.note : null,
        reviewedByUserId: user.userId,
        reviewedByName: actor?.fullName ?? null,
        reviewedAt: now,
      };
      const [review] = await tx
        .insert(attendanceReviews)
        .values({ tenantId: ctx.tenantId, attendanceRecordId: record.id, event, ...values })
        .onConflictDoUpdate({ target: [attendanceReviews.tenantId, attendanceReviews.attendanceRecordId, attendanceReviews.event], set: values })
        .returning({ id: attendanceReviews.id });

      await this.audit.record(tx, ctx, {
        entity: "attendance_record",
        entityId: record.id,
        action: "review",
        before: before ? { event, decision: before.decision, note: before.note } : null,
        after: { event, workDate: record.workDate, flag: status, decision: values.decision, note: values.note, reviewId: review?.id ?? null },
      });
    });
  }

  // owner/admin/atasan (dibaca ulang dari DB); karyawan tidak punya antrean tinjauan
  private async requireViewer(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke halaman ini");
    return viewer;
  }
}
