import {
  type ApiResponse,
  type AttendanceClockInput,
  attendanceClockInputSchema,
  type AttendanceHistory,
  type AttendanceHistoryQuery,
  attendanceHistoryQuerySchema,
  type AttendanceRecord,
  MEMBERSHIP_ROLES,
  type MySchedule,
  SELFIE_MAX_BYTES,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { AttendanceRecapService } from "./attendance-recap.service.js";
import { AttendanceService, type AttendanceTodayResult, type UploadedSelfie } from "./attendance.service.js";
import { ShiftRosterService } from "./shift-roster.service.js";

// Selfie (feature 45) disimpan di memori lalu diteruskan ke storage S3; batas ukuran di multer (413)
const selfieUpload = FileInterceptor("selfie", { limits: { fileSize: SELFIE_MAX_BYTES, files: 1 } });

// Absen masuk/pulang milik sendiri (feature 14, portal /me). Semua peran; syaratnya akun tertaut data karyawan aktif (dicek service).
@Controller("attendance/me")
@Roles(...MEMBERSHIP_ROLES)
export class MyAttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly recap: AttendanceRecapService,
    private readonly roster: ShiftRosterService,
  ) {}

  // "Jadwal saya" (feature 46): hari ini + 6 hari untuk karyawan mode shift; mode business → days kosong
  @Get("schedule")
  async schedule(@CurrentUser() user: AuthUser): Promise<ApiResponse<MySchedule>> {
    return { success: true, data: await this.roster.mySchedule(user) };
  }

  @Get("today")
  async today(@CurrentUser() user: AuthUser): Promise<ApiResponse<AttendanceTodayResult>> {
    return { success: true, data: await this.attendance.today(user) };
  }

  // JSON { location } atau multipart/form-data: location (string JSON / kosong) + selfie (wajib bila karyawan wajib selfie)
  @Post("check-in")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(selfieUpload)
  async checkIn(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(attendanceClockInputSchema)) body: AttendanceClockInput,
    @UploadedFile() file: UploadedSelfie | undefined,
  ): Promise<ApiResponse<AttendanceRecord>> {
    return { success: true, data: await this.attendance.checkIn(user, body.location, file ?? null) };
  }

  // JSON { location } atau multipart/form-data: location (string JSON / kosong) + selfie (wajib bila karyawan wajib selfie)
  @Post("check-out")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(selfieUpload)
  async checkOut(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(attendanceClockInputSchema)) body: AttendanceClockInput,
    @UploadedFile() file: UploadedSelfie | undefined,
  ): Promise<ApiResponse<AttendanceRecord>> {
    return { success: true, data: await this.attendance.checkOut(user, body.location, file ?? null) };
  }

  @Get("history")
  async history(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceHistoryQuerySchema)) query: AttendanceHistoryQuery,
  ): Promise<ApiResponse<AttendanceHistory>> {
    return { success: true, data: await this.recap.myHistory(user, query.month) };
  }
}
