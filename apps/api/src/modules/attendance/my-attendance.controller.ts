import {
  type ApiResponse,
  type AttendanceClockInput,
  attendanceClockInputSchema,
  type AttendanceHistory,
  type AttendanceHistoryQuery,
  attendanceHistoryQuerySchema,
  type AttendanceRecord,
  MEMBERSHIP_ROLES,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { AttendanceService, type AttendanceTodayResult } from "./attendance.service.js";

// Absen masuk/pulang milik sendiri (feature 14, portal /me). Semua peran; syaratnya akun tertaut data karyawan aktif (dicek service).
@Controller("attendance/me")
@Roles(...MEMBERSHIP_ROLES)
export class MyAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get("today")
  async today(@CurrentUser() user: AuthUser): Promise<ApiResponse<AttendanceTodayResult>> {
    return { success: true, data: await this.attendance.today(user) };
  }

  @Post("check-in")
  @HttpCode(HttpStatus.OK)
  async checkIn(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(attendanceClockInputSchema)) body: AttendanceClockInput,
  ): Promise<ApiResponse<AttendanceRecord>> {
    return { success: true, data: await this.attendance.checkIn(user, body.location) };
  }

  @Post("check-out")
  @HttpCode(HttpStatus.OK)
  async checkOut(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(attendanceClockInputSchema)) body: AttendanceClockInput,
  ): Promise<ApiResponse<AttendanceRecord>> {
    return { success: true, data: await this.attendance.checkOut(user, body.location) };
  }

  @Get("history")
  async history(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceHistoryQuerySchema)) query: AttendanceHistoryQuery,
  ): Promise<ApiResponse<AttendanceHistory>> {
    return { success: true, data: await this.attendance.history(user, query.month) };
  }
}
