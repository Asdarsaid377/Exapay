import { employeeSalaries, employeeSalaryItems, employees, provinces, regencies, salaryComponents, tenants } from "@exapay/db";
import type { MinimumWage, MinimumWageEmployee, MinimumWageReference, MinimumWageSummary } from "@exapay/shared";
import { Injectable } from "@nestjs/common";
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import type { Transaction } from "../../database/tenant-transaction.js";
import { localClock } from "../attendance/attendance-clock.js";
import { AttendanceService } from "../attendance/attendance.service.js";
import { RegulationsService } from "../regulations/regulations.service.js";
import { minimumWageFlagOf, type MinimumWageSalaryVersion } from "./minimum-wage-check.js";

// Peringatan upah minimum (feature 34): badge di daftar karyawan & kartu di kalender kepatuhan. Dipanggil di dalam
// transaksi tenant pemanggil SETELAH pemanggil memastikan peran owner/admin (data gaji). Hanya aktif bila usaha
// menyalakannya (tenants.minimum_wage_alerts, bawaan mati — keputusan user 2026-10-02); mati → null, tidak dihitung.
@Injectable()
export class MinimumWageService {
  constructor(
    private readonly regulations: RegulationsService,
    private readonly attendance: AttendanceService,
  ) {}

  // employeeIds null = semua karyawan aktif per hari ini (zona waktu usaha); diisi = hanya karyawan itu (mis. satu halaman
  // daftar karyawan). Karyawan yang tidak ditandai tidak ikut di hasil.
  async summary(tx: Transaction, tenantId: string, employeeIds: readonly string[] | null = null): Promise<MinimumWageSummary | null> {
    // RLS juga memperlihatkan usaha lain milik user — filter eksplisit ke usaha aktif
    const [tenant] = await tx
      .select({ regencyCode: tenants.regencyCode, alerts: tenants.minimumWageAlerts })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    if (!tenant?.alerts) return null;
    const regencyCode = tenant?.regencyCode ?? null;
    if (regencyCode === null) return { locationSet: false, current: null, upcoming: null, employees: [] };

    const today = localClock(new Date(), await this.attendance.tenantTimeZone(tx, tenantId)).date;
    const [currentWage, upcomingWage] = await Promise.all([
      this.regulations.minimumWage(regencyCode, today),
      this.regulations.nextMinimumWage(regencyCode, today),
    ]);
    const [current, upcoming] = await Promise.all([this.reference(tx, currentWage), this.reference(tx, upcomingWage)]);
    if ((current === null && upcoming === null) || employeeIds?.length === 0) return { locationSet: true, current, upcoming, employees: [] };

    const staff = await tx
      .select({ id: employees.id, fullName: employees.fullName, joinDate: employees.joinDate, endDate: employees.endDate })
      .from(employees)
      .where(and(or(isNull(employees.endDate), gte(employees.endDate, today)), employeeIds ? inArray(employees.id, [...employeeIds]) : undefined))
      .orderBy(asc(employees.fullName), asc(employees.id));
    const versions = await this.salaryVersions(
      tx,
      staff.map((row) => row.id),
      today,
    );

    const flagged: MinimumWageEmployee[] = [];
    for (const row of staff) {
      const flag = minimumWageFlagOf({ joinDate: row.joinDate, endDate: row.endDate, salaryVersions: versions.get(row.id) ?? [] }, today, current, upcoming);
      if (flag) flagged.push({ employee: { id: row.id, fullName: row.fullName }, flag });
    }
    return { locationSet: true, current, upcoming, employees: flagged };
  }

  // Versi gaji yang masih berlaku hari ini atau sesudahnya, dengan upah = gaji pokok + tunjangan tetap (SUM numeric di DB)
  private async salaryVersions(tx: Transaction, employeeIds: readonly string[], today: string): Promise<Map<string, MinimumWageSalaryVersion[]>> {
    const byEmployee = new Map<string, MinimumWageSalaryVersion[]>();
    if (employeeIds.length === 0) return byEmployee;
    const rows = await tx
      .select({
        employeeId: employeeSalaries.employeeId,
        effectiveFrom: employeeSalaries.effectiveFrom,
        effectiveTo: employeeSalaries.effectiveTo,
        wage: sql<string>`coalesce(sum(${employeeSalaryItems.amount}) filter (where ${salaryComponents.kind} in ('base_salary', 'fixed_allowance')), 0)::text`,
      })
      .from(employeeSalaries)
      .leftJoin(employeeSalaryItems, and(eq(employeeSalaryItems.tenantId, employeeSalaries.tenantId), eq(employeeSalaryItems.salaryId, employeeSalaries.id)))
      .leftJoin(salaryComponents, and(eq(salaryComponents.tenantId, employeeSalaryItems.tenantId), eq(salaryComponents.id, employeeSalaryItems.componentId)))
      .where(and(inArray(employeeSalaries.employeeId, [...employeeIds]), or(isNull(employeeSalaries.effectiveTo), gte(employeeSalaries.effectiveTo, today))))
      .groupBy(employeeSalaries.id)
      .orderBy(asc(employeeSalaries.effectiveFrom));
    for (const { employeeId, ...version } of rows) {
      const list = byEmployee.get(employeeId) ?? [];
      list.push(version);
      byEmployee.set(employeeId, list);
    }
    return byEmployee;
  }

  private async reference(tx: Transaction, wage: MinimumWage | null): Promise<MinimumWageReference | null> {
    if (!wage) return null;
    const [area] =
      wage.scope === "regency"
        ? await tx.select({ name: regencies.name }).from(regencies).where(eq(regencies.code, wage.areaCode))
        : await tx.select({ name: provinces.name }).from(provinces).where(eq(provinces.code, wage.areaCode));
    return {
      scope: wage.scope,
      areaName: area?.name ?? wage.areaCode,
      monthlyAmount: wage.monthlyAmount,
      effectiveFrom: wage.effectiveFrom,
      effectiveTo: wage.effectiveTo,
    };
  }
}
