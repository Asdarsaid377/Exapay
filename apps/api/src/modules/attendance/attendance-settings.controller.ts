import {
  type ApiResponse,
  calendarYearSchema,
  type CompanyHoliday,
  type CompanyHolidayInput,
  companyHolidayInputSchema,
  type HolidayOverview,
  isValidIsoDate,
  type NationalHoliday,
  type NationalHolidayObservanceInput,
  nationalHolidayObservanceSchema,
  type WorkingDaysQuery,
  workingDaysQuerySchema,
  type WorkingDaysResult,
  type WorkSchedule,
  type WorkScheduleInput,
  workScheduleInputSchema,
} from "@exapay/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, type PipeTransform, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { WorkCalendarService } from "./work-calendar.service.js";

const HOLIDAY_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Libur usaha tidak ditemukan") });
// :date di path bukan tanggal valid → 404 (rute tidak ada), bukan 400
const HOLIDAY_DATE: PipeTransform<string, string> = {
  transform(value: string): string {
    if (!isValidIsoDate(value)) throw new NotFoundException("Hari libur nasional tidak ditemukan");
    return value;
  },
};
const yearQuerySchema = z.object({ year: calendarYearSchema });

// Pengaturan absensi: jadwal kerja & hari libur (feature 13, /settings/attendance) + hitung hari kerja.
@Controller("attendance")
@Roles("owner", "admin")
export class AttendanceSettingsController {
  constructor(private readonly workCalendar: WorkCalendarService) {}

  @Get("schedule")
  async schedule(@CurrentUser() user: AuthUser): Promise<ApiResponse<WorkSchedule>> {
    return { success: true, data: await this.workCalendar.getSchedule(user) };
  }

  @Put("schedule")
  async updateSchedule(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(workScheduleInputSchema)) body: WorkScheduleInput,
  ): Promise<ApiResponse<WorkSchedule>> {
    return { success: true, data: await this.workCalendar.updateSchedule(user, body) };
  }

  @Get("holidays")
  async holidays(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(yearQuerySchema)) query: z.output<typeof yearQuerySchema>,
  ): Promise<ApiResponse<HolidayOverview>> {
    return { success: true, data: await this.workCalendar.holidayOverview(user, query.year) };
  }

  @Put("national-holidays/:date")
  async setNationalObservance(
    @CurrentUser() user: AuthUser,
    @Param("date", HOLIDAY_DATE) date: string,
    @Body(new ZodValidationPipe(nationalHolidayObservanceSchema)) body: NationalHolidayObservanceInput,
  ): Promise<ApiResponse<NationalHoliday>> {
    return { success: true, data: await this.workCalendar.setNationalObservance(user, date, body.observed) };
  }

  @Post("company-holidays")
  async createCompanyHoliday(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(companyHolidayInputSchema)) body: CompanyHolidayInput,
  ): Promise<ApiResponse<CompanyHoliday>> {
    return { success: true, data: await this.workCalendar.createCompanyHoliday(user, body) };
  }

  @Put("company-holidays/:id")
  async updateCompanyHoliday(
    @CurrentUser() user: AuthUser,
    @Param("id", HOLIDAY_ID) id: string,
    @Body(new ZodValidationPipe(companyHolidayInputSchema)) body: CompanyHolidayInput,
  ): Promise<ApiResponse<CompanyHoliday>> {
    return { success: true, data: await this.workCalendar.updateCompanyHoliday(user, id, body) };
  }

  @Delete("company-holidays/:id")
  @HttpCode(HttpStatus.OK)
  async removeCompanyHoliday(@CurrentUser() user: AuthUser, @Param("id", HOLIDAY_ID) id: string): Promise<ApiResponse<null>> {
    await this.workCalendar.removeCompanyHoliday(user, id);
    return { success: true, data: null };
  }

  @Get("working-days")
  async workingDays(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(workingDaysQuerySchema)) query: WorkingDaysQuery,
  ): Promise<ApiResponse<WorkingDaysResult>> {
    return { success: true, data: await this.workCalendar.workingDays(user, query) };
  }
}
