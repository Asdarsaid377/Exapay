import { attendanceRecords, attendanceReviews, employees, positions, users, workShifts } from "@exapay/db";
import {
  ATTENDANCE_REVIEWS_PAGE_SIZE,
  type AttendanceEvent,
  type AttendanceFlagKind,
  type AttendanceReviewDecision,
  type AttendanceReviewDecisionData,
  type AttendanceReviewItem,
  type AttendanceReviewList,
  type AttendanceReviewListQuery,
  type AttendanceReviewSubject,
  GEOFENCE_FLAG_KINDS,
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
import { AttendanceService, selfieStateOf } from "./attendance.service.js";
import { WorkLocationsService } from "./work-locations.service.js";

const FLAGGED = [...GEOFENCE_FLAG_KINDS];

type ReviewRow = {
  attendanceRecordId: string;
  event: AttendanceEvent;
  subject: AttendanceReviewSubject;
  decision: AttendanceReviewDecision;
  note: string | null;
  reviewedByName: string | null;
  reviewedAt: Date;
};

// Tinjauan absen bertanda (feature 44, /attendance/review): satu item per absen masuk/pulang yang bertanda (di luar lokasi,
// lokasi tidak akurat, tanpa lokasi) + satu item "Tanpa jadwal" per absen masuk karyawan mode shift di hari tanpa shift
// (feature 47, subject schedule — ditinjau terpisah dari tanda lokasi absen yang sama). Owner/admin semua karyawan; atasan bawahan langsung. Keputusan tidak mengubah jam/gaji —
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
      const flaggedRecord = or(
        inArray(attendanceRecords.checkInGeofence, FLAGGED),
        inArray(attendanceRecords.checkOutGeofence, FLAGGED),
        eq(attendanceRecords.unscheduled, true),
      );
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
          checkInSelfieKey: attendanceRecords.checkInSelfieKey,
          checkInSelfieType: attendanceRecords.checkInSelfieType,
          checkOutSelfieKey: attendanceRecords.checkOutSelfieKey,
          checkOutSelfieType: attendanceRecords.checkOutSelfieType,
          unscheduled: attendanceRecords.unscheduled,
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
                subject: attendanceReviews.subject,
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
      const reviewOf = (recordId: string, event: AttendanceEvent, subject: AttendanceReviewSubject): AttendanceReviewItem["review"] => {
        const row = reviews.find((r) => r.attendanceRecordId === recordId && r.event === event && r.subject === subject);
        return row ? { decision: row.decision, note: row.note, reviewedByName: row.reviewedByName, reviewedAt: row.reviewedAt.toISOString() } : null;
      };

      const items: AttendanceReviewItem[] = [];
      for (const record of records) {
        const employee = { id: record.employeeId, fullName: record.fullName, positionName: record.positionName };
        const canReview = record.employeeId !== viewer.ownEmployeeId;
        const sides = [
          {
            event: "check_in",
            at: record.checkInAt,
            status: record.checkInGeofence,
            distanceM: record.checkInDistanceM,
            locationName: record.checkInLocationName,
            accuracyM: record.checkInAccuracy,
            selfie: selfieStateOf(record.checkInSelfieKey, record.checkInSelfieType),
          },
          {
            event: "check_out",
            at: record.checkOutAt,
            status: record.checkOutGeofence,
            distanceM: record.checkOutDistanceM,
            locationName: record.checkOutLocationName,
            accuracyM: record.checkOutAccuracy,
            selfie: selfieStateOf(record.checkOutSelfieKey, record.checkOutSelfieType),
          },
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
            selfie: side.selfie,
            review: reviewOf(record.id, side.event, "location"),
            canReview,
          });
        }
        if (record.unscheduled) {
          items.push({
            recordId: record.id,
            event: "check_in",
            employee,
            workDate: record.workDate,
            at: record.checkInAt.toISOString(),
            flag: { kind: "no_schedule", distanceM: null, locationName: null, accuracyM: null },
            selfie: sides[0].selfie,
            review: reviewOf(record.id, "check_in", "schedule"),
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
        hasShifts: (await tx.select({ id: workShifts.id }).from(workShifts).limit(1)).length > 0,
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
          unscheduled: attendanceRecords.unscheduled,
        })
        .from(attendanceRecords)
        .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
        .where(eq(attendanceRecords.id, recordId));
      if (!record || !viewerCanSee(viewer, record.supervisorId)) throw new NotFoundException("Absen tidak ditemukan");
      if (record.employeeId === viewer.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat meninjau absensi Anda sendiri");
      const { subject } = input;
      const geofence = event === "check_in" ? record.checkInGeofence : record.checkOutGeofence;
      let flag: AttendanceFlagKind | null = null;
      if (subject === "schedule") flag = event === "check_in" && record.unscheduled ? "no_schedule" : null;
      else if (isAttendanceFlag(geofence)) flag = geofence;
      if (!flag) throw new ConflictException("Absen ini tidak bertanda — tidak perlu ditinjau. Muat ulang halaman.");

      const [before] = await tx
        .select({ decision: attendanceReviews.decision, note: attendanceReviews.note })
        .from(attendanceReviews)
        .where(and(eq(attendanceReviews.attendanceRecordId, record.id), eq(attendanceReviews.event, event), eq(attendanceReviews.subject, subject)))
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
        .values({ tenantId: ctx.tenantId, attendanceRecordId: record.id, event, subject, ...values })
        .onConflictDoUpdate({
          target: [attendanceReviews.tenantId, attendanceReviews.attendanceRecordId, attendanceReviews.event, attendanceReviews.subject],
          set: values,
        })
        .returning({ id: attendanceReviews.id });

      await this.audit.record(tx, ctx, {
        entity: "attendance_record",
        entityId: record.id,
        action: "review",
        before: before ? { event, subject, decision: before.decision, note: before.note } : null,
        after: { event, subject, workDate: record.workDate, flag, decision: values.decision, note: values.note, reviewId: review?.id ?? null },
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
