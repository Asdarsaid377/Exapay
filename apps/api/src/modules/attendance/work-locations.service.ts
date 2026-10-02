import { employees, employeeWorkLocations, workLocations } from "@exapay/db";
import {
  type EmployeeAttendanceSettings,
  type EmployeeAttendanceSettingsData,
  type EmployeeLocationMode,
  WORK_LOCATIONS_MAX,
  type WorkLocation,
  type WorkLocationData,
  type WorkLocationOverview,
} from "@exapay/shared";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, eq, inArray, isNull, notExists, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { type AttendanceViewer, loadAttendanceViewer, viewerCanSee } from "./attendance-viewer.js";
import type { GeofenceSite } from "./geofence.js";

const locationColumns = {
  id: workLocations.id,
  name: workLocations.name,
  address: workLocations.address,
  latitude: workLocations.latitude,
  longitude: workLocations.longitude,
  radiusM: workLocations.radiusM,
};

type LocationRow = { id: string; name: string; address: string | null; latitude: number; longitude: number; radiusM: number };

const auditOf = (row: LocationRow): Omit<LocationRow, "id"> => ({
  name: row.name,
  address: row.address,
  latitude: row.latitude,
  longitude: row.longitude,
  radiusM: row.radiusM,
});

// Karyawan aktif = belum keluar (end_date kosong) — sama dengan filter "Aktif" daftar karyawan
const activeEmployee = isNull(employees.endDate);

// Lokasi kerja usaha & pengaturan lokasi per karyawan (feature 44). Kelola: owner/admin (peran dibaca ulang dari DB);
// pengaturan per karyawan bisa dibaca atasan untuk bawahan langsung. sitesFor dipakai AttendanceService saat absen.
@Injectable()
export class WorkLocationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async overview(user: AuthUser): Promise<WorkLocationOverview> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const rows = await tx.select(locationColumns).from(workLocations).orderBy(asc(workLocations.name));
      const selectedCounts = await tx
        .select({ locationId: employeeWorkLocations.workLocationId, total: count() })
        .from(employeeWorkLocations)
        .innerJoin(employees, eq(employees.id, employeeWorkLocations.employeeId))
        .where(and(activeEmployee, eq(employees.locationMode, "selected")))
        .groupBy(employeeWorkLocations.workLocationId);
      const modeCounts = await tx
        .select({ mode: employees.locationMode, total: count() })
        .from(employees)
        .where(activeEmployee)
        .groupBy(employees.locationMode);

      const countOf = (mode: EmployeeLocationMode): number => modeCounts.find((row) => row.mode === mode)?.total ?? 0;
      const items: WorkLocation[] = rows.map((row) => ({
        ...row,
        selectedEmployeeCount: selectedCounts.find((c) => c.locationId === row.id)?.total ?? 0,
      }));
      return { items, employees: { all: countOf("all"), selected: countOf("selected"), exempt: countOf("exempt") } };
    });
  }

  async create(user: AuthUser, input: WorkLocationData): Promise<WorkLocation> {
    const ctx = tenantContextOf(user);
    return this.withNameGuard(() =>
      withTenant(this.db, ctx, async (tx) => {
        await this.requireManager(tx, ctx);
        const [total] = await tx.select({ total: count() }).from(workLocations);
        if ((total?.total ?? 0) >= WORK_LOCATIONS_MAX) throw new BadRequestException(`Maksimal ${WORK_LOCATIONS_MAX} lokasi kerja per usaha`);
        const [row] = await tx
          .insert(workLocations)
          .values({ tenantId: ctx.tenantId, ...input })
          .returning(locationColumns);
        if (!row) throw new Error("[work-locations/create] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, { entity: "work_location", entityId: row.id, action: "create", after: auditOf(row) });
        return { ...row, selectedEmployeeCount: 0 };
      }),
    );
  }

  async update(user: AuthUser, id: string, input: WorkLocationData): Promise<WorkLocation> {
    const ctx = tenantContextOf(user);
    return this.withNameGuard(() =>
      withTenant(this.db, ctx, async (tx) => {
        await this.requireManager(tx, ctx);
        const [before] = await tx.select(locationColumns).from(workLocations).where(eq(workLocations.id, id)).for("update");
        if (!before) throw new NotFoundException("Lokasi kerja tidak ditemukan");
        const [row] = await tx.update(workLocations).set(input).where(eq(workLocations.id, id)).returning(locationColumns);
        if (!row) throw new NotFoundException("Lokasi kerja tidak ditemukan");
        await this.audit.record(tx, ctx, { entity: "work_location", entityId: id, action: "update", before: auditOf(before), after: auditOf(row) });
        const [selected] = await tx
          .select({ total: count() })
          .from(employeeWorkLocations)
          .innerJoin(employees, eq(employees.id, employeeWorkLocations.employeeId))
          .where(and(eq(employeeWorkLocations.workLocationId, id), activeEmployee, eq(employees.locationMode, "selected")));
        return { ...row, selectedEmployeeCount: selected?.total ?? 0 };
      }),
    );
  }

  // Absen lama tidak berubah (status & nama lokasi tersimpan sebagai snapshot). Karyawan "lokasi tertentu" yang kehilangan
  // semua lokasinya kembali ke "semua lokasi" — dicatat di audit per karyawan.
  async remove(user: AuthUser, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const [deleted] = await tx.delete(workLocations).where(eq(workLocations.id, id)).returning(locationColumns);
      if (!deleted) throw new NotFoundException("Lokasi kerja tidak ditemukan");
      await this.audit.record(tx, ctx, { entity: "work_location", entityId: id, action: "delete", before: auditOf(deleted) });

      const orphaned = await tx
        .update(employees)
        .set({ locationMode: "all" })
        .where(
          and(
            eq(employees.locationMode, "selected"),
            notExists(tx.select({ one: sql`1` }).from(employeeWorkLocations).where(eq(employeeWorkLocations.employeeId, employees.id))),
          ),
        )
        .returning({ id: employees.id });
      for (const employee of orphaned) {
        await this.audit.record(tx, ctx, {
          entity: "employee",
          entityId: employee.id,
          action: "update_attendance_settings",
          before: { locationMode: "selected", locationIds: [id] },
          after: { locationMode: "all", locationIds: [], reason: "work_location_deleted" },
        });
      }
    });
  }

  async employeeSettings(user: AuthUser, employeeId: string): Promise<EmployeeAttendanceSettings> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await loadAttendanceViewer(tx, ctx);
      const employee = await this.visibleEmployee(tx, viewer, employeeId);
      return this.settingsOf(tx, employee.id, employee.locationMode, viewer?.manage ?? false);
    });
  }

  async updateEmployeeSettings(user: AuthUser, employeeId: string, input: EmployeeAttendanceSettingsData): Promise<EmployeeAttendanceSettings> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.requireManager(tx, ctx);
      const [employee] = await tx.select({ id: employees.id, locationMode: employees.locationMode }).from(employees).where(eq(employees.id, employeeId)).for("update");
      if (!employee) throw new NotFoundException("Karyawan tidak ditemukan");

      const locationIds = input.locationMode === "selected" ? [...new Set(input.locationIds)] : [];
      if (locationIds.length > 0) {
        const found = await tx.select({ id: workLocations.id }).from(workLocations).where(inArray(workLocations.id, locationIds));
        if (found.length !== locationIds.length) throw new BadRequestException("Lokasi kerja tidak ditemukan — muat ulang halaman");
      }
      const beforeIds = await this.selectedIds(tx, employee.id);

      await tx.update(employees).set({ locationMode: input.locationMode }).where(eq(employees.id, employee.id));
      await tx.delete(employeeWorkLocations).where(eq(employeeWorkLocations.employeeId, employee.id));
      if (locationIds.length > 0) {
        await tx
          .insert(employeeWorkLocations)
          .values(locationIds.map((workLocationId) => ({ tenantId: ctx.tenantId, employeeId: employee.id, workLocationId })));
      }
      await this.audit.record(tx, ctx, {
        entity: "employee",
        entityId: employee.id,
        action: "update_attendance_settings",
        before: { locationMode: employee.locationMode, locationIds: employee.locationMode === "selected" ? beforeIds : [] },
        after: { locationMode: input.locationMode, locationIds },
      });
      return this.settingsOf(tx, employee.id, input.locationMode, true);
    });
  }

  // Lokasi yang berlaku untuk absen karyawan ini; kosong = tidak dicek (usaha tanpa lokasi / dikecualikan).
  // Mode "selected" tanpa lokasi tersisa tidak terjadi (remove mengembalikan ke "all"), tetap aman: dicek ke semua lokasi.
  async sitesFor(tx: Transaction, employeeId: string): Promise<GeofenceSite[]> {
    const [employee] = await tx.select({ locationMode: employees.locationMode }).from(employees).where(eq(employees.id, employeeId));
    if (!employee || employee.locationMode === "exempt") return [];
    const siteColumns = { name: workLocations.name, latitude: workLocations.latitude, longitude: workLocations.longitude, radiusM: workLocations.radiusM };
    if (employee.locationMode === "selected") {
      const selected = await tx
        .select(siteColumns)
        .from(employeeWorkLocations)
        .innerJoin(workLocations, eq(workLocations.id, employeeWorkLocations.workLocationId))
        .where(eq(employeeWorkLocations.employeeId, employeeId));
      if (selected.length > 0) return selected;
    }
    return tx.select(siteColumns).from(workLocations);
  }

  async hasLocations(tx: Transaction): Promise<boolean> {
    const [row] = await tx.select({ id: workLocations.id }).from(workLocations).limit(1);
    return row !== undefined;
  }

  private async settingsOf(tx: Transaction, employeeId: string, mode: EmployeeLocationMode, canEdit: boolean): Promise<EmployeeAttendanceSettings> {
    const locations = await tx.select({ id: workLocations.id, name: workLocations.name }).from(workLocations).orderBy(asc(workLocations.name));
    return { locationMode: mode, locationIds: mode === "selected" ? await this.selectedIds(tx, employeeId) : [], locations, canEdit };
  }

  private async selectedIds(tx: Transaction, employeeId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: employeeWorkLocations.workLocationId })
      .from(employeeWorkLocations)
      .where(eq(employeeWorkLocations.employeeId, employeeId));
    return rows.map((row) => row.id).sort();
  }

  // Owner/admin semua karyawan; atasan hanya bawahan langsung (di luar cakupan → 404, tidak membocorkan keberadaan)
  private async visibleEmployee(
    tx: Transaction,
    viewer: AttendanceViewer | null,
    employeeId: string,
  ): Promise<{ id: string; locationMode: EmployeeLocationMode }> {
    if (!viewer) throw new ForbiddenException("Anda tidak memiliki akses ke halaman ini");
    const [employee] = await tx
      .select({ id: employees.id, supervisorId: employees.supervisorId, locationMode: employees.locationMode })
      .from(employees)
      .where(eq(employees.id, employeeId));
    if (!employee || !viewerCanSee(viewer, employee.supervisorId)) throw new NotFoundException("Karyawan tidak ditemukan");
    return employee;
  }

  private async requireManager(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer> {
    const viewer = await loadAttendanceViewer(tx, ctx);
    if (!viewer?.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat mengatur lokasi kerja");
    return viewer;
  }

  private async withNameGuard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ConflictException("Nama lokasi sudah dipakai — gunakan nama lain");
      throw error;
    }
  }
}
