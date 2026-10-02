import {
  type ApiResponse,
  type EmployeeAttendanceSettings,
  type EmployeeAttendanceSettingsData,
  employeeAttendanceSettingsInputSchema,
} from "@exapay/shared";
import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { WorkLocationsService } from "./work-locations.service.js";

const EMPLOYEE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Karyawan tidak ditemukan") });

// Pengaturan absen per karyawan (feature 44: lokasi absen) — section "Pengaturan absen" di detail karyawan.
// Baca: owner/admin semua, atasan bawahan langsung (hanya baca). Ubah: owner/admin. Cakupan dicek service.
@Controller("employees/:id/attendance-settings")
export class EmployeeAttendanceSettingsController {
  constructor(private readonly workLocations: WorkLocationsService) {}

  @Get()
  @Roles("owner", "admin", "atasan")
  async get(@CurrentUser() user: AuthUser, @Param("id", EMPLOYEE_ID) id: string): Promise<ApiResponse<EmployeeAttendanceSettings>> {
    return { success: true, data: await this.workLocations.employeeSettings(user, id) };
  }

  @Put()
  @Roles("owner", "admin")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", EMPLOYEE_ID) id: string,
    @Body(new ZodValidationPipe(employeeAttendanceSettingsInputSchema)) body: EmployeeAttendanceSettingsData,
  ): Promise<ApiResponse<EmployeeAttendanceSettings>> {
    return { success: true, data: await this.workLocations.updateEmployeeSettings(user, id, body) };
  }
}
