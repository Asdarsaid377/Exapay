import { companyHolidays, employees, nationalHolidayExclusions, nationalHolidays, shiftRosterDays, workScheduleDays } from "@exapay/db";
import {
  type CompanyHoliday,
  type CompanyHolidayInput,
  DEFAULT_WORK_SCHEDULE,
  type HolidayOverview,
  type NationalHoliday,
  type Weekday,
  type WorkingDaysQuery,
  type WorkingDaysResult,
  type WorkSchedule,
  type WorkScheduleDay,
  type WorkScheduleInput,
  WEEKDAYS,
} from "@exapay/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, between, eq, inArray, max, min, sql } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { countHolidaysOnWorkdays, countWorkingDays, isoWeekday, type WorkCalendar, workingDaysByMonth } from "./work-calendar.js";

// Baris roster (feature 46) — shiftName/startTime/endTime null = libur. Jam dibaca "HH:MM:SS".
export type RosterDayRow = {
  employeeId: string;
  workDate: string;
  workShiftId: string | null;
  shiftName: string | null;
  startTime: string | null;
  endTime: string | null;
};

export type WorkDayInfo = {
  isWorkday: boolean;
  // "HH:MM" — null jika bukan hari kerja
  startTime: string | null;
  endTime: string | null;
  holidayName: string | null;
};

// Kolom `time` Postgres dibaca "08:00:00" → tampilkan & bandingkan sebagai "08:00"
function hhmm(value: string): string {
  return value.slice(0, 5);
}

function toWeekday(value: number): Weekday {
  const weekday = WEEKDAYS.find((day) => day === value);
  if (!weekday) throw new Error(`[attendance/work-calendar] weekday tidak valid: ${value}`);
  return weekday;
}

// Jadwal kerja default & hari libur usaha aktif (feature 13). Tabel tenant dibaca lewat RLS tenant_isolation;
// national_holidays adalah data referensi platform (policy reference_read) yang dibaca di transaksi yang sama.
@Injectable()
export class WorkCalendarService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async getSchedule(user: AuthUser): Promise<WorkSchedule> {
    return withTenant(this.db, tenantContextOf(user), (tx) => this.loadSchedule(tx));
  }

  async updateSchedule(user: AuthUser, input: WorkScheduleInput): Promise<WorkSchedule> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      // Kunci baris jadwal: dua penyimpanan bersamaan tidak saling menimpa diam-diam
      await tx.select({ weekday: workScheduleDays.weekday }).from(workScheduleDays).for("update");
      const current = await this.loadSchedule(tx);

      const before: WorkScheduleDay[] = [];
      const after: WorkScheduleDay[] = [];
      for (const day of input.days) {
        const existing = current.days.find((d) => d.weekday === day.weekday);
        const unchanged =
          existing && existing.isWorkday === day.isWorkday && existing.startTime === day.startTime && existing.endTime === day.endTime;
        if (unchanged) continue;
        if (existing) before.push(existing);
        after.push(day);
        // Upsert: jadwal usaha lama tanpa baris (seharusnya tidak ada — diisi saat tenant dibuat / migration 0010) tetap tersimpan
        await tx
          .insert(workScheduleDays)
          .values({ tenantId: ctx.tenantId, weekday: day.weekday, isWorkday: day.isWorkday, startTime: day.startTime, endTime: day.endTime })
          .onConflictDoUpdate({
            target: [workScheduleDays.tenantId, workScheduleDays.weekday],
            set: { isWorkday: day.isWorkday, startTime: day.startTime, endTime: day.endTime },
          });
      }
      if (after.length > 0) {
        await this.audit.record(tx, ctx, { entity: "work_schedule", entityId: ctx.tenantId, action: "update", before, after });
      }
      return this.loadSchedule(tx);
    });
  }

  async holidayOverview(user: AuthUser, year: number): Promise<HolidayOverview> {
    return withTenant(this.db, tenantContextOf(user), async (tx) => {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      const national = await this.listNational(tx, from, to);
      const company = await this.listCompany(tx, from, to);
      const years = await tx
        .selectDistinct({ year: sql<number>`extract(year from ${nationalHolidays.date})::int` })
        .from(nationalHolidays)
        .orderBy(sql`1`);
      const calendar = await this.loadCalendar(tx, from, to);
      return {
        year,
        nationalYears: years.map((row) => row.year),
        national,
        company,
        workingDaysByMonth: workingDaysByMonth(calendar, year),
      };
    });
  }

  // observed=false → usaha tetap masuk kerja di tanggal libur nasional/cuti bersama ini
  async setNationalObservance(user: AuthUser, date: string, observed: boolean): Promise<NationalHoliday> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const [holiday] = await tx
        .select({ date: nationalHolidays.date, name: nationalHolidays.name, kind: nationalHolidays.kind })
        .from(nationalHolidays)
        .where(eq(nationalHolidays.date, date));
      if (!holiday) throw new NotFoundException("Hari libur nasional tidak ditemukan");

      const changed = observed
        ? await tx.delete(nationalHolidayExclusions).where(eq(nationalHolidayExclusions.date, date)).returning({ date: nationalHolidayExclusions.date })
        : await tx
            .insert(nationalHolidayExclusions)
            .values({ tenantId: ctx.tenantId, date })
            .onConflictDoNothing()
            .returning({ date: nationalHolidayExclusions.date });
      if (changed.length > 0) {
        await this.audit.record(tx, ctx, {
          entity: "national_holiday",
          entityId: date,
          action: observed ? "observe" : "work",
          after: { name: holiday.name, observed },
        });
      }
      return { ...holiday, observed };
    });
  }

  async createCompanyHoliday(user: AuthUser, input: CompanyHolidayInput): Promise<CompanyHoliday> {
    const ctx = tenantContextOf(user);
    return this.mapDuplicate(() =>
      withTenant(this.db, ctx, async (tx) => {
        const [row] = await tx
          .insert(companyHolidays)
          .values({ tenantId: ctx.tenantId, date: input.date, name: input.name })
          .returning({ id: companyHolidays.id, date: companyHolidays.date, name: companyHolidays.name });
        if (!row) throw new Error("[attendance/createCompanyHoliday] insert tidak mengembalikan baris");
        await this.audit.record(tx, ctx, { entity: "company_holiday", entityId: row.id, action: "create", after: { date: row.date, name: row.name } });
        return row;
      }),
    );
  }

  async updateCompanyHoliday(user: AuthUser, id: string, input: CompanyHolidayInput): Promise<CompanyHoliday> {
    const ctx = tenantContextOf(user);
    return this.mapDuplicate(() =>
      withTenant(this.db, ctx, async (tx) => {
        const [current] = await tx
          .select({ date: companyHolidays.date, name: companyHolidays.name })
          .from(companyHolidays)
          .where(eq(companyHolidays.id, id))
          .for("update");
        if (!current) throw new NotFoundException("Libur usaha tidak ditemukan");

        const [row] = await tx
          .update(companyHolidays)
          .set({ date: input.date, name: input.name })
          .where(eq(companyHolidays.id, id))
          .returning({ id: companyHolidays.id, date: companyHolidays.date, name: companyHolidays.name });
        if (!row) throw new NotFoundException("Libur usaha tidak ditemukan");
        if (current.date !== row.date || current.name !== row.name) {
          await this.audit.record(tx, ctx, { entity: "company_holiday", entityId: id, action: "update", before: current, after: { date: row.date, name: row.name } });
        }
        return row;
      }),
    );
  }

  async removeCompanyHoliday(user: AuthUser, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const [row] = await tx
        .delete(companyHolidays)
        .where(eq(companyHolidays.id, id))
        .returning({ date: companyHolidays.date, name: companyHolidays.name });
      if (!row) throw new NotFoundException("Libur usaha tidak ditemukan");
      await this.audit.record(tx, ctx, { entity: "company_holiday", entityId: id, action: "delete", before: row });
    });
  }

  async workingDays(user: AuthUser, query: WorkingDaysQuery): Promise<WorkingDaysResult> {
    return withTenant(this.db, tenantContextOf(user), async (tx) => {
      const calendar = await this.loadCalendar(tx, query.from, query.to);
      return {
        from: query.from,
        to: query.to,
        workingDays: countWorkingDays(calendar, query.from, query.to),
        holidaysOnWorkdays: countHolidaysOnWorkdays(calendar, query.from, query.to),
      };
    });
  }

  // Kalender kerja usaha untuk rentang tanggal — dipakai modul lain (absensi, KPI, payroll) di dalam transaksi ber-tenant mereka
  async loadCalendar(tx: Transaction, from: string, to: string): Promise<WorkCalendar> {
    const schedule = await this.loadSchedule(tx);
    const national = await this.listNational(tx, from, to);
    const company = await this.listCompany(tx, from, to);
    return {
      workdays: new Set(schedule.days.filter((day) => day.isWorkday).map((day) => day.weekday)),
      holidays: new Set([...national.filter((h) => h.observed).map((h) => h.date), ...company.map((h) => h.date)]),
    };
  }

  // Kalender kerja per karyawan (feature 47): mode shift → hari kerja = tanggal ber-shift di roster dalam rentang, mulai
  // tanggal roster pertama karyawan (sebelumnya & tanpa roster sama sekali = kalender usaha — mode tidak berversi, pindah
  // mode tidak mengubah hari lampau); ikut jadwal usaha → kalender usaha apa adanya.
  async employeeCalendars(tx: Transaction, base: WorkCalendar, employeeIds: readonly string[], from: string, to: string): Promise<Map<string, WorkCalendar>> {
    const calendars = new Map<string, WorkCalendar>(employeeIds.map((id) => [id, base]));
    const shiftIds = await this.shiftModeEmployeeIds(tx, employeeIds);
    if (shiftIds.length === 0) return calendars;
    const rows = await this.rosterRows(tx, shiftIds, from, to);
    const firstDates = await tx
      .select({ employeeId: shiftRosterDays.employeeId, since: min(shiftRosterDays.workDate) })
      .from(shiftRosterDays)
      .where(inArray(shiftRosterDays.employeeId, shiftIds))
      .groupBy(shiftRosterDays.employeeId);
    for (const id of shiftIds) {
      const since = firstDates.find((row) => row.employeeId === id)?.since;
      if (!since) continue;
      const own = rows.filter((row) => row.employeeId === id);
      calendars.set(id, {
        ...base,
        roster: {
          since,
          shiftDates: new Set(own.filter((row) => row.shiftName !== null).map((row) => row.workDate)),
          offDates: new Set(own.filter((row) => row.shiftName === null).map((row) => row.workDate)),
        },
      });
    }
    return calendars;
  }

  async shiftModeEmployeeIds(tx: Transaction, employeeIds: readonly string[]): Promise<string[]> {
    if (employeeIds.length === 0) return [];
    const rows = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(and(inArray(employees.id, [...employeeIds]), eq(employees.scheduleMode, "shift")));
    return rows.map((row) => row.id);
  }

  async rosterRows(tx: Transaction, employeeIds: readonly string[], from: string, to: string): Promise<RosterDayRow[]> {
    if (employeeIds.length === 0) return [];
    return tx
      .select({
        employeeId: shiftRosterDays.employeeId,
        workDate: shiftRosterDays.workDate,
        workShiftId: shiftRosterDays.workShiftId,
        shiftName: shiftRosterDays.shiftName,
        startTime: shiftRosterDays.startTime,
        endTime: shiftRosterDays.endTime,
      })
      .from(shiftRosterDays)
      .where(and(inArray(shiftRosterDays.employeeId, [...employeeIds]), between(shiftRosterDays.workDate, from, to)));
  }

  // Jadwal satu tanggal untuk absen (feature 14): hari kerja = hari kerja jadwal dan bukan libur yang diikuti
  async dayInfo(tx: Transaction, date: string): Promise<WorkDayInfo> {
    const schedule = await this.loadSchedule(tx);
    const national = await this.listNational(tx, date, date);
    const company = await this.listCompany(tx, date, date);
    const holidayName = company[0]?.name ?? national.find((h) => h.observed)?.name ?? null;
    const day = schedule.days.find((d) => d.weekday === isoWeekday(date));
    if (!day?.isWorkday || holidayName !== null) return { isWorkday: false, startTime: null, endTime: null, holidayName };
    return { isWorkday: true, startTime: day.startTime, endTime: day.endTime, holidayName: null };
  }

  private async loadSchedule(tx: Transaction): Promise<WorkSchedule> {
    const rows = await tx
      .select({
        weekday: workScheduleDays.weekday,
        isWorkday: workScheduleDays.isWorkday,
        startTime: workScheduleDays.startTime,
        endTime: workScheduleDays.endTime,
      })
      .from(workScheduleDays)
      .orderBy(asc(workScheduleDays.weekday));
    const [latest] = await tx.select({ updatedAt: max(workScheduleDays.updatedAt) }).from(workScheduleDays);

    // Hari tanpa baris (tidak terjadi setelah migration 0010) jatuh ke jadwal bawaan agar hitungan tetap lengkap 7 hari
    const days = WEEKDAYS.map((weekday): WorkScheduleDay => {
      const row = rows.find((r) => r.weekday === weekday);
      const fallback = DEFAULT_WORK_SCHEDULE.find((d) => d.weekday === weekday);
      if (row) return { weekday: toWeekday(row.weekday), isWorkday: row.isWorkday, startTime: hhmm(row.startTime), endTime: hhmm(row.endTime) };
      if (!fallback) throw new Error(`[attendance/loadSchedule] jadwal bawaan tidak lengkap: ${weekday}`);
      return { ...fallback };
    });
    return { days, updatedAt: latest?.updatedAt ? latest.updatedAt.toISOString() : null };
  }

  private async listNational(tx: Transaction, from: string, to: string): Promise<NationalHoliday[]> {
    const rows = await tx
      .select({
        date: nationalHolidays.date,
        name: nationalHolidays.name,
        kind: nationalHolidays.kind,
        excludedDate: nationalHolidayExclusions.date,
      })
      .from(nationalHolidays)
      // RLS membatasi exclusions ke usaha aktif
      .leftJoin(nationalHolidayExclusions, eq(nationalHolidayExclusions.date, nationalHolidays.date))
      .where(between(nationalHolidays.date, from, to))
      .orderBy(asc(nationalHolidays.date));
    return rows.map(({ excludedDate, ...holiday }) => ({ ...holiday, observed: excludedDate === null }));
  }

  private async listCompany(tx: Transaction, from: string, to: string): Promise<CompanyHoliday[]> {
    return tx
      .select({ id: companyHolidays.id, date: companyHolidays.date, name: companyHolidays.name })
      .from(companyHolidays)
      .where(between(companyHolidays.date, from, to))
      .orderBy(asc(companyHolidays.date));
  }

  // Satu libur usaha per tanggal (index unik) — termasuk dua permintaan bersamaan
  private async mapDuplicate<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ConflictException("Sudah ada libur usaha di tanggal ini");
      throw error;
    }
  }
}

// Jadwal bawaan untuk tenant baru (dipanggil seedTenantDefaults di transaksi pembuatan tenant)
export async function seedDefaultWorkSchedule(tx: Transaction, ctx: TenantContext): Promise<void> {
  await tx.insert(workScheduleDays).values(DEFAULT_WORK_SCHEDULE.map((day) => ({ tenantId: ctx.tenantId, ...day })));
}
