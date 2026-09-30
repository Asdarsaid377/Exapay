import {
  type ApiResponse,
  type AttendanceCorrectionInput,
  attendanceCorrectionInputSchema,
  type AttendanceCorrectionList,
  type AttendanceCorrectionListQuery,
  attendanceCorrectionListQuerySchema,
} from "@exapay/shared";
import { Body, Controller, Get, Post, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { AttendanceCorrectionsService } from "./attendance-corrections.service.js";

// Koreksi absensi (feature 16, /attendance/corrections): hanya owner/admin (peran dibaca ulang di service), tercatat di audit log.
@Controller("attendance/corrections")
@Roles("owner", "admin")
export class AttendanceCorrectionsController {
  constructor(private readonly corrections: AttendanceCorrectionsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceCorrectionListQuerySchema)) query: AttendanceCorrectionListQuery,
  ): Promise<ApiResponse<AttendanceCorrectionList>> {
    return { success: true, data: await this.corrections.list(user, query) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(attendanceCorrectionInputSchema)) body: AttendanceCorrectionInput,
  ): Promise<ApiResponse<null>> {
    await this.corrections.create(user, body);
    return { success: true, data: null };
  }
}
