import { kpiIndicators, kpiTemplates, positions, taskLogs } from "@exapay/db";
import { type KpiIndicator, type KpiTemplate, type KpiTemplateData, type KpiTemplateOverview, trimDecimal } from "@exapay/shared";
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { foreignKeyViolationConstraint, isUniqueViolation } from "../../database/errors.js";
import { type Database, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { BUILTIN_KPI_TEMPLATES, indicatorColumns, seedBuiltinKpiTemplates } from "./kpi-builtin-templates.js";

const ENTITY = "kpi_template";
// Kiriman bersamaan yang lolos pemeriksaan (log baru dicatat saat template disimpan) — FK task_logs_indicator_fk RESTRICT
const LOGGED_CONFLICT = "Indikator template ini baru saja dipakai mencatat tugas. Muat ulang halaman lalu coba lagi.";

// Isi template untuk audit log (before/after)
type TemplateSnapshot = {
  name: string;
  description: string | null;
  positions: string[];
  indicators: Omit<KpiIndicator, "id">[];
};

// Template KPI per jabatan usaha aktif (feature 18) — owner/admin. RLS tenant_isolation membatasi baris ke tenant aktif.
// Total bobot 100% & isian per tipe divalidasi kpiTemplateInputSchema di controller; CHECK di DB menjaga isian per tipe.
@Injectable()
export class KpiTemplatesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async overview(user: AuthUser): Promise<KpiTemplateOverview> {
    return withTenant(this.db, tenantContextOf(user), async (tx) => {
      const templates = await this.loadTemplates(tx);
      const positionRows = await tx
        .select({ id: positions.id, name: positions.name, templateId: positions.kpiTemplateId })
        .from(positions)
        .orderBy(asc(positions.name));
      const builtinKeys = new Set((await tx.select({ key: kpiTemplates.builtinKey }).from(kpiTemplates)).map((row) => row.key));
      const templateNames = new Map(templates.map((template) => [template.id, template.name]));
      return {
        templates,
        positions: positionRows.map((row) => ({ ...row, templateName: row.templateId ? (templateNames.get(row.templateId) ?? null) : null })),
        missingBuiltinCount: BUILTIN_KPI_TEMPLATES.filter((template) => !builtinKeys.has(template.key)).length,
      };
    });
  }

  async create(user: AuthUser, input: KpiTemplateData): Promise<{ id: string }> {
    const ctx = tenantContextOf(user);
    return this.mapConstraintErrors(() =>
      withTenant(this.db, ctx, async (tx) => {
        await this.assertPositionsExist(tx, input.positionIds);
        const [row] = await tx
          .insert(kpiTemplates)
          .values({ tenantId: ctx.tenantId, name: input.name, description: input.description })
          .returning({ id: kpiTemplates.id });
        if (!row) throw new Error("[kpi/create] insert tidak mengembalikan baris");

        // Template baru: id indikator dari klien (mis. hasil salin) diabaikan — semua indikator baru
        await tx
          .insert(kpiIndicators)
          .values(input.indicators.map((indicator, index) => ({ tenantId: ctx.tenantId, templateId: row.id, sortOrder: index, ...indicatorColumns(indicator) })));
        await this.assignPositions(tx, row.id, input.positionIds);

        await this.audit.record(tx, ctx, { entity: ENTITY, entityId: row.id, action: "create", after: await this.snapshot(tx, row.id) });
        return row;
      }),
    );
  }

  // Indikator ber-id = diubah, tanpa id = baru, yang tidak dikirim = dihapus.
  // Indikator yang sudah punya log tugas (feature 19) tidak boleh dihapus/diganti tipenya → 409 (FK task_logs RESTRICT sebagai pengaman).
  async update(user: AuthUser, id: string, input: KpiTemplateData): Promise<{ id: string }> {
    const ctx = tenantContextOf(user);
    return this.mapConstraintErrors(() =>
      withTenant(this.db, ctx, async (tx) => {
        const [current] = await tx.select({ id: kpiTemplates.id }).from(kpiTemplates).where(eq(kpiTemplates.id, id)).for("update");
        if (!current) throw new NotFoundException("Template KPI tidak ditemukan");
        await this.assertPositionsExist(tx, input.positionIds);
        const before = await this.snapshot(tx, id);

        const existing = await tx
          .select({ id: kpiIndicators.id, name: kpiIndicators.name, type: kpiIndicators.type })
          .from(kpiIndicators)
          .where(eq(kpiIndicators.templateId, id));
        const existingIds = new Set(existing.map((row) => row.id));
        const keptIds = input.indicators.flatMap((indicator) => (indicator.id ? [indicator.id] : []));
        if (keptIds.some((indicatorId) => !existingIds.has(indicatorId))) {
          throw new BadRequestException("Indikator tidak ditemukan. Muat ulang halaman lalu coba lagi.");
        }
        const logged = await this.loggedIndicatorIds(tx, [...existingIds]);
        for (const indicator of existing) {
          if (!logged.has(indicator.id)) continue;
          const kept = input.indicators.find((candidate) => candidate.id === indicator.id);
          if (!kept) throw new ConflictException(`Indikator "${indicator.name}" sudah dipakai mencatat tugas karyawan sehingga tidak bisa dihapus`);
          if (kept.type !== indicator.type) {
            throw new ConflictException(`Tipe indikator "${indicator.name}" tidak bisa diganti karena sudah dipakai mencatat tugas karyawan`);
          }
        }

        await tx
          .delete(kpiIndicators)
          .where(keptIds.length ? and(eq(kpiIndicators.templateId, id), notInArray(kpiIndicators.id, keptIds)) : eq(kpiIndicators.templateId, id));
        for (const [index, indicator] of input.indicators.entries()) {
          const columns = { sortOrder: index, ...indicatorColumns(indicator) };
          if (indicator.id) {
            await tx.update(kpiIndicators).set(columns).where(eq(kpiIndicators.id, indicator.id));
          } else {
            await tx.insert(kpiIndicators).values({ tenantId: ctx.tenantId, templateId: id, ...columns });
          }
        }

        await tx.update(kpiTemplates).set({ name: input.name, description: input.description }).where(eq(kpiTemplates.id, id));
        await this.assignPositions(tx, id, input.positionIds);

        const after = await this.snapshot(tx, id);
        await this.audit.record(tx, ctx, { entity: ENTITY, entityId: id, action: "update", before, after });
        return { id };
      }),
    );
  }

  // Indikator ikut terhapus (FK cascade); jabatan yang memakai template menjadi tanpa template (FK SET NULL).
  // Template yang indikatornya sudah punya log tugas (feature 19) tidak bisa dihapus → 409.
  async remove(user: AuthUser, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await this.mapConstraintErrors(() =>
      withTenant(this.db, ctx, async (tx) => {
        const [current] = await tx.select({ id: kpiTemplates.id }).from(kpiTemplates).where(eq(kpiTemplates.id, id)).for("update");
        if (!current) throw new NotFoundException("Template KPI tidak ditemukan");
        const indicatorIds = (await tx.select({ id: kpiIndicators.id }).from(kpiIndicators).where(eq(kpiIndicators.templateId, id))).map((row) => row.id);
        if ((await this.loggedIndicatorIds(tx, indicatorIds)).size > 0) {
          throw new ConflictException("Template ini sudah dipakai mencatat tugas karyawan sehingga tidak bisa dihapus. Lepas jabatannya jika tidak dipakai lagi.");
        }
        const before = await this.snapshot(tx, id);
        await tx.delete(kpiTemplates).where(eq(kpiTemplates.id, id));
        await this.audit.record(tx, ctx, { entity: ENTITY, entityId: id, action: "delete", before });
      }),
    );
  }

  // Tambahkan kembali template bawaan yang belum ada (terhapus / usaha dibuat sebelum feature 18)
  async addBuiltins(user: AuthUser): Promise<{ added: number }> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const added = await seedBuiltinKpiTemplates(tx, ctx);
      for (const template of added) {
        await this.audit.record(tx, ctx, { entity: ENTITY, entityId: template.id, action: "create", after: await this.snapshot(tx, template.id) });
      }
      return { added: added.length };
    });
  }

  // Semua template usaha, atau satu template (onlyId) untuk snapshot audit
  private async loadTemplates(tx: Transaction, onlyId?: string): Promise<KpiTemplate[]> {
    const templateRows = await tx
      .select({ id: kpiTemplates.id, name: kpiTemplates.name, description: kpiTemplates.description, builtinKey: kpiTemplates.builtinKey, updatedAt: kpiTemplates.updatedAt })
      .from(kpiTemplates)
      .where(onlyId ? eq(kpiTemplates.id, onlyId) : undefined)
      .orderBy(asc(kpiTemplates.name));
    const indicatorRows = await tx
      .select({
        id: kpiIndicators.id,
        templateId: kpiIndicators.templateId,
        name: kpiIndicators.name,
        type: kpiIndicators.type,
        unit: kpiIndicators.unit,
        target: kpiIndicators.target,
        targetPeriod: kpiIndicators.targetPeriod,
        systemMetric: kpiIndicators.systemMetric,
        weight: kpiIndicators.weight,
      })
      .from(kpiIndicators)
      .where(onlyId ? eq(kpiIndicators.templateId, onlyId) : undefined)
      .orderBy(asc(kpiIndicators.sortOrder));
    const positionRows = await tx
      .select({ id: positions.id, name: positions.name, templateId: positions.kpiTemplateId })
      .from(positions)
      .where(onlyId ? eq(positions.kpiTemplateId, onlyId) : undefined)
      .orderBy(asc(positions.name));

    return templateRows.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      builtin: template.builtinKey !== null,
      positions: positionRows.filter((row) => row.templateId === template.id).map(({ id, name }) => ({ id, name })),
      indicators: indicatorRows
        .filter((row) => row.templateId === template.id)
        .map(({ templateId: _templateId, ...indicator }) => ({ ...indicator, target: trimDecimal(indicator.target) })),
      updatedAt: template.updatedAt.toISOString(),
    }));
  }

  private async snapshot(tx: Transaction, id: string): Promise<TemplateSnapshot | null> {
    const [template] = await this.loadTemplates(tx, id);
    if (!template) return null;
    return {
      name: template.name,
      description: template.description,
      positions: template.positions.map((position) => position.name),
      indicators: template.indicators.map(({ id: _id, ...indicator }) => indicator),
    };
  }

  private async assertPositionsExist(tx: Transaction, positionIds: string[]): Promise<void> {
    if (positionIds.length === 0) return;
    const found = await tx.select({ id: positions.id }).from(positions).where(inArray(positions.id, positionIds));
    if (found.length !== positionIds.length) throw new BadRequestException("Jabatan tidak ditemukan. Muat ulang halaman lalu coba lagi.");
  }

  // Jabatan terpilih memakai template ini (dipindah dari template lain bila perlu); yang dilepas menjadi tanpa template
  private async assignPositions(tx: Transaction, templateId: string, positionIds: string[]): Promise<void> {
    await tx
      .update(positions)
      .set({ kpiTemplateId: null })
      .where(positionIds.length ? and(eq(positions.kpiTemplateId, templateId), notInArray(positions.id, positionIds)) : eq(positions.kpiTemplateId, templateId));
    if (positionIds.length) await tx.update(positions).set({ kpiTemplateId: templateId }).where(inArray(positions.id, positionIds));
  }

  // Indikator (dari daftar) yang sudah punya log tugas
  private async loggedIndicatorIds(tx: Transaction, indicatorIds: string[]): Promise<Set<string>> {
    if (indicatorIds.length === 0) return new Set();
    const rows = await tx.selectDistinct({ id: taskLogs.indicatorId }).from(taskLogs).where(inArray(taskLogs.indicatorId, indicatorIds));
    return new Set(rows.flatMap((row) => (row.id ? [row.id] : [])));
  }

  // Nama template unik per usaha (index lower(name)) — termasuk dua permintaan bersamaan; indikator yang baru dipakai log tugas
  private async mapConstraintErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ConflictException("Template dengan nama ini sudah ada");
      if (foreignKeyViolationConstraint(error) === "task_logs_indicator_fk") throw new ConflictException(LOGGED_CONFLICT);
      throw error;
    }
  }
}
