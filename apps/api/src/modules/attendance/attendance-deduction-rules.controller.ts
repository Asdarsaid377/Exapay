import {
  type ApiResponse,
  type AttendanceDeductionPreview,
  type AttendanceDeductionPreviewInput,
  attendanceDeductionPreviewInputSchema,
  type AttendanceDeductionSettings,
  type SaveAttendanceDeductionRulesInput,
  saveAttendanceDeductionRulesSchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { AttendanceDeductionRulesService } from "./attendance-deduction-rules.service.js";

// Aturan potongan absensi (feature 17, /settings/attendance): daftar versi, simpan versi baru, pratinjau.
@Controller("attendance/deduction-rules")
@Roles("owner", "admin")
export class AttendanceDeductionRulesController {
  constructor(private readonly deductionRules: AttendanceDeductionRulesService) {}

  @Get()
  async settings(@CurrentUser() user: AuthUser): Promise<ApiResponse<AttendanceDeductionSettings>> {
    return { success: true, data: await this.deductionRules.settings(user) };
  }

  @Post()
  async save(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(saveAttendanceDeductionRulesSchema)) body: SaveAttendanceDeductionRulesInput,
  ): Promise<ApiResponse<AttendanceDeductionSettings>> {
    return { success: true, data: await this.deductionRules.save(user, body) };
  }

  // Tidak menyimpan apa pun — 200, bukan 201
  @Post("preview")
  @HttpCode(HttpStatus.OK)
  async preview(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(attendanceDeductionPreviewInputSchema)) body: AttendanceDeductionPreviewInput,
  ): Promise<ApiResponse<AttendanceDeductionPreview>> {
    return { success: true, data: await this.deductionRules.preview(user, body) };
  }
}
