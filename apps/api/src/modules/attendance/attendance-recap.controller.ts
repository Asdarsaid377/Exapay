import { type ApiResponse, type AttendancePeriodQuery, attendancePeriodQuerySchema, type AttendanceRecap, type EmployeeAttendanceDays } from "@exapay/shared";
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { AttendanceRecapService } from "./attendance-recap.service.js";

const EMPLOYEE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Karyawan tidak ditemukan") });

// Rekap absensi per periode (feature 16, /attendance): owner/admin semua karyawan, atasan bawahan langsung (dicek service).
@Controller("attendance/recap")
@Roles("owner", "admin", "atasan")
export class AttendanceRecapController {
  constructor(private readonly recap: AttendanceRecapService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendancePeriodQuerySchema)) query: AttendancePeriodQuery,
  ): Promise<ApiResponse<AttendanceRecap>> {
    return { success: true, data: await this.recap.recap(user, query) };
  }

  // Rincian harian satu karyawan (halaman koreksi)
  @Get(":employeeId")
  async employeeDays(
    @CurrentUser() user: AuthUser,
    @Param("employeeId", EMPLOYEE_ID) employeeId: string,
    @Query(new ZodValidationPipe(attendancePeriodQuerySchema)) query: AttendancePeriodQuery,
  ): Promise<ApiResponse<EmployeeAttendanceDays>> {
    return { success: true, data: await this.recap.employeeDays(user, employeeId, query) };
  }
}
