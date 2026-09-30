import { departments, employees, kpiReviewPeriods, kpiReviewRatings, kpiReviews, kpiTemplates, positions, taskLogs, tenants, users } from "@exapay/db";
import {
  type CreateKpiReviewsInput,
  type CreateKpiReviewsResult,
  KPI_REVIEW_STATUS_LABELS,
  type KpiReviewCycle,
  type KpiReviewDetail,
  type KpiReviewList,
  type KpiReviewListQuery,
  type KpiReviewPeriod,
  type KpiReviewRatingsInput,
  type KpiReviewRow,
  type KpiReviewSnapshot,
  kpiReviewSnapshotSchema,
  type KpiReviewStatus,
  type KpiReviewStatusInput,
  type KpiScoreResult,
  type KpiSettings,
  type KpiSettingsInput,
  trimDecimal,
} from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, notInArray, or, type SQL, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { exclusionViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { localClock } from "../attendance/attendance-clock.js";
import { type AttendanceViewer, loadAttendanceViewer, viewerCanSee, viewerEmployeeScope } from "../attendance/attendance-viewer.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { AuditService } from "../audit/audit.service.js";
import { candidatePeriods, periodsOverlap, reviewPeriodOf } from "./kpi-review-periods.js";
import { KpiScoresService, type Scored, type ScoredEmployee } from "./kpi-scores.service.js";

const NOT_FOUND = "Penilaian tidak ditemukan";
const CHANGED = "Penilaian ini baru saja diubah pengguna lain. Muat ulang halaman lalu periksa lagi.";
const NO_TEMPLATE = "Jabatan karyawan ini belum memakai template KPI. Atur template di menu Template KPI.";
const UNRATED = "Nilai semua indikator penilaian atasan terlebih dahulu.";

// Versi isi = mikrodetik epoch updated_at (presisi penuh Postgres; Date JS hanya milidetik)
const versionOf = sql<string>`(extract(epoch from ${kpiReviews.updatedAt}) * 1000000)::bigint::text`;

type ReviewEmployee = ScoredEmployee & { fullName: string; positionName: string; departmentName: string; supervisorId: string | null };

type ReviewRecord = {
  id: string;
  status: KpiReviewStatus;
  version: string;
  periodId: string;
  cycle: KpiReviewCycle;
  startDate: string;
  endDate: string;
  submittedAt: Date | null;
  submittedByName: string | null;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  finalScore: string | null;
  finalPredicate: KpiReviewRow["predicate"];
  snapshot: unknown;
  employee: ReviewEmployee;
};

// Kolom karyawan untuk skor (id = kpi_reviews.employee_id)
const employeeColumns = {
  fullName: employees.fullName,
  joinDate: employees.joinDate,
  employmentEndDate: employees.endDate,
  supervisorId: employees.supervisorId,
  positionName: positions.name,
  departmentName: departments.name,
  templateId: kpiTemplates.id,
  templateName: kpiTemplates.name,
};

const reviewColumns = {
  id: kpiReviews.id,
  status: kpiReviews.status,
  version: versionOf,
  periodId: kpiReviewPeriods.id,
  cycle: kpiReviewPeriods.cycle,
  startDate: kpiReviewPeriods.startDate,
  endDate: kpiReviewPeriods.endDate,
  submittedAt: kpiReviews.submittedAt,
  submittedByName: kpiReviews.submittedByName,
  finalizedAt: kpiReviews.finalizedAt,
  finalizedByName: kpiReviews.finalizedByName,
  finalScore: kpiReviews.finalScore,
  finalPredicate: kpiReviews.finalPredicate,
  snapshot: kpiReviews.snapshot,
  employeeId: kpiReviews.employeeId,
  ...employeeColumns,
};

function selectReviews(tx: Transaction, where: SQL | undefined) {
  return tx
    .select(reviewColumns)
    .from(kpiReviews)
    .innerJoin(kpiReviewPeriods, eq(kpiReviewPeriods.id, kpiReviews.periodId))
    .innerJoin(employees, eq(employees.id, kpiReviews.employeeId))
    .innerJoin(positions, eq(positions.id, employees.positionId))
    .innerJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(kpiTemplates, eq(kpiTemplates.id, positions.kpiTemplateId))
    .where(where)
    .orderBy(asc(employees.fullName));
}

type ReviewRow = Awaited<ReturnType<typeof selectReviews>>[number];

function toRecord(row: ReviewRow): ReviewRecord {
  const { employeeId, fullName, joinDate, employmentEndDate, supervisorId, positionName, departmentName, templateId, templateName, ...review } = row;
  return {
    ...review,
    employee: { id: employeeId, fullName, joinDate, endDate: employmentEndDate, supervisorId, positionName, departmentName, templateId, templateName },
  };
}

function unratedOf(result: KpiScoreResult | null): number {
  return result ? result.indicators.filter((indicator) => indicator.status === "not_rated").length : 0;
}

// Siklus & penilaian KPI periodik (feature 22). Owner/admin: pengaturan siklus, membuat periode, mengembalikan & memfinalkan;
// atasan langsung + owner/admin: mengisi nilai indikator penilaian & mengirim. Atasan hanya melihat bawahan langsung.
// Tidak ada yang menilai/memfinalkan penilaiannya sendiri. Skor draft/reviewed dihitung saat dibaca (KpiScoresService);
// final = snapshot terkunci (trigger kpi_reviews_guard_final). Semua mutasi diaudit.
@Injectable()
export class KpiReviewsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly attendance: AttendanceService,
    private readonly scores: KpiScoresService,
    private readonly audit: AuditService,
  ) {}

  // ——— siklus ———

  async settings(user: AuthUser): Promise<KpiSettings> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const cycle = await this.tenantCycle(tx, ctx);
      return { reviewCycle: cycle, currentPeriod: reviewPeriodOf(cycle, await this.today(tx, ctx)) };
    });
  }

  async updateSettings(user: AuthUser, input: KpiSettingsInput): Promise<KpiSettings> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const before = await this.tenantCycle(tx, ctx);
      if (before !== input.reviewCycle) {
        await tx.update(tenants).set({ kpiReviewCycle: input.reviewCycle }).where(eq(tenants.id, ctx.tenantId));
        await this.audit.record(tx, ctx, { entity: "kpi_settings", entityId: ctx.tenantId, action: "update", before: { reviewCycle: before }, after: input });
      }
      return { reviewCycle: input.reviewCycle, currentPeriod: reviewPeriodOf(input.reviewCycle, await this.today(tx, ctx)) };
    });
  }

  // ——— daftar & buat periode ———

  async list(user: AuthUser, query: KpiReviewListQuery): Promise<KpiReviewList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const today = await this.today(tx, ctx);
      const cycle = await this.tenantCycle(tx, ctx);
      const scope = viewerEmployeeScope(viewer);

      const periodRows = await tx
        .select({ id: kpiReviewPeriods.id, cycle: kpiReviewPeriods.cycle, startDate: kpiReviewPeriods.startDate, endDate: kpiReviewPeriods.endDate })
        .from(kpiReviewPeriods)
        .orderBy(desc(kpiReviewPeriods.startDate));
      const countRows = await tx
        .select({ periodId: kpiReviews.periodId, status: kpiReviews.status, total: count() })
        .from(kpiReviews)
        .innerJoin(employees, eq(employees.id, kpiReviews.employeeId))
        .where(scope)
        .groupBy(kpiReviews.periodId, kpiReviews.status);
      const periods: KpiReviewPeriod[] = periodRows.map((period) => {
        const counts = { draft: 0, reviewed: 0, final: 0 };
        for (const row of countRows) if (row.periodId === period.id) counts[row.status] = row.total;
        return { ...period, counts };
      });
      const selected = periods.find((period) => period.id === query.period) ?? periods[0] ?? null;

      const rows = selected ? await this.periodRows(tx, selected, scope, today) : [];
      const missingCount = viewer.manage && selected ? (await this.missingEmployees(tx, selected)).length : 0;
      return {
        scope: viewer.manage ? "all" : "subordinates",
        cycle,
        today,
        periods,
        period: selected,
        rows,
        candidates: viewer.manage ? candidatePeriods(cycle, today, periods) : [],
        missingCount,
      };
    });
  }

  // Buat periode (siklus saat ini, sudah berakhir, tidak beririsan) + penilaian draft untuk karyawan yang memenuhi syarat.
  // Periode yang sama sudah ada → hanya menambahkan karyawan yang belum punya penilaian.
  async create(user: AuthUser, input: CreateKpiReviewsInput): Promise<CreateKpiReviewsResult> {
    const ctx = tenantContextOf(user);
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        await this.requireManager(tx, ctx);
        const today = await this.today(tx, ctx);
        const cycle = await this.tenantCycle(tx, ctx);
        const existingPeriods = await tx
          .select({ id: kpiReviewPeriods.id, startDate: kpiReviewPeriods.startDate, endDate: kpiReviewPeriods.endDate })
          .from(kpiReviewPeriods);
        // Periode yang sudah ada dikenali dari tanggal mulainya (tetap bisa ditambah walau siklus usaha sudah diganti)
        let period = existingPeriods.find((other) => other.startDate === input.startDate) ?? null;
        const isNew = period === null;
        const range = period ? { startDate: period.startDate, endDate: period.endDate } : reviewPeriodOf(cycle, input.startDate);
        if (!period) {
          if (range.startDate !== input.startDate) throw new BadRequestException("Tanggal mulai tidak sesuai siklus penilaian saat ini");
          if (range.endDate >= today) throw new BadRequestException("Periode ini belum berakhir. Penilaian dibuat setelah periode selesai.");
          if (existingPeriods.some((other) => periodsOverlap(range, other))) {
            throw new ConflictException("Periode ini beririsan dengan periode penilaian yang sudah dibuat");
          }
          if (!candidatePeriods(cycle, today, existingPeriods).some((candidate) => candidate.startDate === range.startDate)) {
            throw new BadRequestException("Periode ini terlalu lama. Pilih periode yang ditawarkan.");
          }
        }

        const missing = await this.missingEmployees(tx, period ?? { id: null, ...range });
        if (isNew && missing.length === 0) throw new BadRequestException("Belum ada karyawan dengan template KPI di periode ini");
        if (!period) {
          const [created] = await tx
            .insert(kpiReviewPeriods)
            .values({ tenantId: ctx.tenantId, cycle, ...range, createdByUserId: user.userId })
            .returning({ id: kpiReviewPeriods.id, startDate: kpiReviewPeriods.startDate, endDate: kpiReviewPeriods.endDate });
          if (!created) throw new Error("[kpi-reviews/create] insert periode tidak mengembalikan baris");
          period = created;
        }
        const periodId = period.id;

        const inserted =
          missing.length === 0
            ? []
            : await tx
                .insert(kpiReviews)
                .values(missing.map((employeeId) => ({ tenantId: ctx.tenantId, periodId, employeeId })))
                .onConflictDoNothing()
                .returning({ id: kpiReviews.id });
        await this.audit.record(tx, ctx, {
          entity: "kpi_review_period",
          entityId: periodId,
          action: isNew ? "create" : "add_employees",
          after: { cycle, ...range, employees: inserted.length },
        });
        return { periodId, created: inserted.length };
      });
    } catch (error) {
      // Dua pembuatan bersamaan untuk periode beririsan
      if (exclusionViolationConstraint(error) === "kpi_review_periods_no_overlap") {
        throw new ConflictException("Periode ini baru saja dibuat pengguna lain. Muat ulang halaman.");
      }
      throw error;
    }
  }

  // ——— detail & mutasi ———

  async detail(user: AuthUser, id: string): Promise<KpiReviewDetail> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const [row] = await selectReviews(tx, eq(kpiReviews.id, id));
      const review = row ? toRecord(row) : null;
      if (!review || !viewerCanSee(viewer, review.employee.supervisorId)) throw new NotFoundException(NOT_FOUND);
      const own = review.employee.id === viewer.ownEmployeeId;

      const base = {
        id: review.id,
        status: review.status,
        version: review.version,
        period: { id: review.periodId, cycle: review.cycle, startDate: review.startDate, endDate: review.endDate },
        submittedAt: review.submittedAt?.toISOString() ?? null,
        submittedByName: review.submittedByName,
        finalizedAt: review.finalizedAt?.toISOString() ?? null,
        finalizedByName: review.finalizedByName,
      };
      if (review.status === "final") {
        const snapshot = this.snapshotOf(review);
        return {
          ...base,
          employee: { id: review.employee.id, ...snapshot.employee },
          template: snapshot.template,
          result: snapshot.result,
          pendingTaskLogs: 0,
          permissions: { rate: false, returnToDraft: false, finalize: false },
        };
      }

      const scored = await this.scoreReview(tx, review, await this.today(tx, ctx));
      const [pending] = await tx
        .select({ total: count() })
        .from(taskLogs)
        .where(
          and(
            eq(taskLogs.employeeId, review.employee.id),
            eq(taskLogs.status, "pending"),
            gte(taskLogs.workDate, review.startDate),
            lte(taskLogs.workDate, review.endDate),
          ),
        );
      const decider = viewer.manage && !own && review.status === "reviewed";
      return {
        ...base,
        employee: {
          id: review.employee.id,
          fullName: review.employee.fullName,
          positionName: review.employee.positionName,
          departmentName: review.employee.departmentName,
        },
        template: scored.template,
        result: scored.result,
        pendingTaskLogs: pending?.total ?? 0,
        permissions: { rate: review.status === "draft" && !own && scored.template !== null, returnToDraft: decider, finalize: decider },
      };
    });
  }

  // Simpan nilai indikator penilaian (mengganti semua nilai) — hanya draft. submit = sekalian kirim untuk direview.
  async rate(user: AuthUser, id: string, input: KpiReviewRatingsInput): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      const review = await this.lockReview(tx, viewer, id, input.version);
      if (review.employee.id === viewer.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat menilai penilaian Anda sendiri");
      this.requireStatus(review, "draft");

      const scored = await this.scoreReview(tx, review, await this.today(tx, ctx), new Map());
      if (!scored.template || !scored.result) throw new BadRequestException(NO_TEMPLATE);
      const ratingIds = new Set(scored.result.indicators.filter((indicator) => indicator.type === "rating").map((indicator) => indicator.id));
      if (input.ratings.some((rating) => !ratingIds.has(rating.indicatorId))) {
        throw new BadRequestException("Indikator penilaian tidak valid. Muat ulang halaman — template KPI mungkin baru diubah.");
      }
      if (input.submit && input.ratings.length < ratingIds.size) throw new BadRequestException(UNRATED);

      const before = await this.ratingsOf(tx, [review.id]);
      await tx.delete(kpiReviewRatings).where(eq(kpiReviewRatings.reviewId, review.id));
      if (input.ratings.length > 0) {
        await tx.insert(kpiReviewRatings).values(input.ratings.map((rating) => ({ tenantId: ctx.tenantId, reviewId: review.id, ...rating })));
      }
      const actorName = input.submit ? await this.actorName(tx, user) : null;
      await tx
        .update(kpiReviews)
        .set(
          input.submit
            ? { status: "reviewed", submittedAt: new Date(), submittedByUserId: user.userId, submittedByName: actorName }
            : // Versi ikut berubah agar penyimpanan bersamaan terdeteksi
              { updatedAt: new Date() },
        )
        .where(eq(kpiReviews.id, review.id));

      await this.audit.record(tx, ctx, {
        entity: "kpi_review",
        entityId: review.id,
        action: input.submit ? "submit" : "rate",
        before: { status: review.status, ratings: Object.fromEntries(before.get(review.id) ?? new Map()) },
        after: {
          status: input.submit ? "reviewed" : review.status,
          ratings: Object.fromEntries(input.ratings.map((rating) => [rating.indicatorId, rating.rating])),
        },
      });
    });
  }

  // Owner/admin: kembalikan ke draf atau finalkan penilaian yang sudah dikirim
  async changeStatus(user: AuthUser, id: string, input: KpiReviewStatusInput): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.requireViewer(tx, ctx);
      if (!viewer.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat memfinalkan penilaian");
      const review = await this.lockReview(tx, viewer, id, input.version);
      if (review.employee.id === viewer.ownEmployeeId) throw new ForbiddenException("Anda tidak dapat memfinalkan penilaian Anda sendiri");
      this.requireStatus(review, "reviewed");

      if (input.action === "return") {
        await tx
          .update(kpiReviews)
          .set({ status: "draft", submittedAt: null, submittedByUserId: null, submittedByName: null })
          .where(eq(kpiReviews.id, review.id));
        await this.audit.record(tx, ctx, { entity: "kpi_review", entityId: review.id, action: "return", before: { status: "reviewed" }, after: { status: "draft" } });
        return;
      }

      // Skor dihitung sekali lagi saat final lalu disimpan sebagai snapshot — sesudahnya tidak pernah dihitung ulang
      const scored = await this.scoreReview(tx, review, await this.today(tx, ctx));
      if (!scored.template || !scored.result) throw new BadRequestException(NO_TEMPLATE);
      if (unratedOf(scored.result) > 0) throw new BadRequestException(`${UNRATED} Template KPI berubah sejak penilaian dikirim — kembalikan ke draf.`);
      const snapshot: KpiReviewSnapshot = {
        employee: { fullName: review.employee.fullName, positionName: review.employee.positionName, departmentName: review.employee.departmentName },
        template: scored.template,
        result: scored.result,
      };
      await tx
        .update(kpiReviews)
        .set({
          status: "final",
          finalizedAt: new Date(),
          finalizedByUserId: user.userId,
          finalizedByName: await this.actorName(tx, user),
          finalScore: scored.result.score,
          finalPredicate: scored.result.predicate,
          snapshot,
        })
        .where(eq(kpiReviews.id, review.id));
      await this.audit.record(tx, ctx, {
        entity: "kpi_review",
        entityId: review.id,
        action: "finalize",
        before: { status: "reviewed" },
        after: { status: "final", score: scored.result.score, predicate: scored.result.predicate, template: scored.template.name },
      });
    });
  }

  // ——— helper ———

  private async periodRows(tx: Transaction, period: KpiReviewPeriod, scope: SQL | undefined, today: string): Promise<KpiReviewRow[]> {
    const records = (await selectReviews(tx, and(eq(kpiReviews.periodId, period.id), scope))).map(toRecord);
    const open = records.filter((record) => record.status !== "final");
    const ratings = await this.ratingsOf(
      tx,
      open.map((record) => record.id),
    );
    const scored = await this.scores.scoreEmployees(
      tx,
      open.map((record) => record.employee),
      { from: period.startDate, to: period.endDate },
      today,
      new Map(open.map((record) => [record.employee.id, ratings.get(record.id) ?? new Map<string, number>()])),
    );

    return records.map((record) => {
      if (record.status === "final") {
        const snapshot = this.snapshotOf(record);
        return {
          id: record.id,
          status: record.status,
          employee: { id: record.employee.id, ...snapshot.employee },
          templateName: snapshot.template.name,
          score: record.finalScore === null ? null : trimDecimal(record.finalScore),
          predicate: record.finalPredicate,
          unratedCount: 0,
        };
      }
      const { template, result } = scored.get(record.employee.id) ?? { template: null, result: null };
      return {
        id: record.id,
        status: record.status,
        employee: {
          id: record.employee.id,
          fullName: record.employee.fullName,
          positionName: record.employee.positionName,
          departmentName: record.employee.departmentName,
        },
        templateName: template?.name ?? null,
        score: result?.score ?? null,
        predicate: result?.predicate ?? null,
        unratedCount: unratedOf(result),
      };
    });
  }

  // Karyawan yang masa kerjanya beririsan dengan periode, jabatannya memakai template KPI, dan belum punya penilaian di periode itu
  private async missingEmployees(tx: Transaction, period: { id: string | null; startDate: string; endDate: string }): Promise<string[]> {
    const existing = period.id ? tx.select({ id: kpiReviews.employeeId }).from(kpiReviews).where(eq(kpiReviews.periodId, period.id)) : null;
    const rows = await tx
      .select({ id: employees.id })
      .from(employees)
      .innerJoin(positions, eq(positions.id, employees.positionId))
      .where(
        and(
          sql`${positions.kpiTemplateId} IS NOT NULL`,
          lte(employees.joinDate, period.endDate),
          or(isNull(employees.endDate), gte(employees.endDate, period.startDate)),
          existing ? notInArray(employees.id, existing) : undefined,
        ),
      )
      .orderBy(asc(employees.fullName));
    return rows.map((row) => row.id);
  }

  // Kunci baris penilaian (bukan karyawan/template) lalu periksa cakupan & versi
  private async lockReview(tx: Transaction, viewer: AttendanceViewer, id: string, version: string): Promise<ReviewRecord> {
    const [row] = await selectReviews(tx, eq(kpiReviews.id, id)).for("update", { of: kpiReviews });
    const review = row ? toRecord(row) : null;
    if (!review || !viewerCanSee(viewer, review.employee.supervisorId)) throw new NotFoundException(NOT_FOUND);
    if (review.status !== "final" && review.version !== version) throw new ConflictException(CHANGED);
    return review;
  }

  private requireStatus(review: ReviewRecord, expected: KpiReviewStatus): void {
    if (review.status !== expected) throw new ConflictException(`Penilaian ini sudah berstatus ${KPI_REVIEW_STATUS_LABELS[review.status].toLowerCase()}`);
  }

  // Skor satu penilaian yang belum final. ratings tidak diisi → nilai tersimpan
  private async scoreReview(tx: Transaction, review: ReviewRecord, today: string, ratings?: ReadonlyMap<string, number>): Promise<Scored> {
    const own = ratings ?? (await this.ratingsOf(tx, [review.id])).get(review.id) ?? new Map<string, number>();
    const scored = await this.scores.scoreEmployees(tx, [review.employee], { from: review.startDate, to: review.endDate }, today, new Map([[review.employee.id, own]]));
    return scored.get(review.employee.id) ?? { template: null, result: null };
  }

  // id penilaian → id indikator → nilai
  private async ratingsOf(tx: Transaction, reviewIds: readonly string[]): Promise<Map<string, Map<string, number>>> {
    const result = new Map<string, Map<string, number>>();
    if (reviewIds.length === 0) return result;
    const rows = await tx
      .select({ reviewId: kpiReviewRatings.reviewId, indicatorId: kpiReviewRatings.indicatorId, rating: kpiReviewRatings.rating })
      .from(kpiReviewRatings)
      .where(inArray(kpiReviewRatings.reviewId, [...reviewIds]));
    for (const row of rows) {
      const map = result.get(row.reviewId) ?? new Map<string, number>();
      map.set(row.indicatorId, row.rating);
      result.set(row.reviewId, map);
    }
    return result;
  }

  private snapshotOf(review: ReviewRecord): KpiReviewSnapshot {
    const parsed = kpiReviewSnapshotSchema.safeParse(review.snapshot);
    if (!parsed.success) throw new Error(`[kpi-reviews/snapshot] snapshot penilaian ${review.id} tidak valid`);
    return parsed.data;
  }

  private async tenantCycle(tx: Transaction, ctx: TenantContext): Promise<KpiReviewCycle> {
    const [tenant] = await tx.select({ cycle: tenants.kpiReviewCycle }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    if (!tenant) throw new NotFoundException("Usaha tidak ditemukan");
    return tenant.cycle;
  }

  private async today(tx: Transaction, ctx: TenantContext): Promise<string> {
    return localClock(new Date(), await this.attendance.tenantTimeZone(tx, ctx.tenantId)).date;
  }

  private async actorName(tx: Transaction, user: AuthUser): Promise<string | null> {
    const [actor] = await tx.select({ fullName: users.fullName }).from(users).where(eq(users.id, user.userId));
    return actor?.fullName ?? null;
  }

  private async requireViewer(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke penilaian KPI");
    return viewer;
  }

  private async requireManager(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await this.requireViewer(tx, ctx);
    if (!viewer.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat mengatur penilaian KPI");
    return viewer;
  }
}
