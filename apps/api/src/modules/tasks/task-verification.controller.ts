import {
  type ApiResponse,
  type TaskBulkApproveInput,
  type TaskBulkApproveResult,
  taskBulkApproveSchema,
  type TaskDecisionData,
  taskDecisionSchema,
  type TaskVerificationList,
  type TaskVerificationQuery,
  taskVerificationQuerySchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { TaskVerificationService } from "./task-verification.service.js";

const LOG_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Catatan tugas tidak ditemukan") });

// Verifikasi catatan tugas harian (feature 20, /kpi/verification): owner/admin semua karyawan, atasan bawahan langsung.
// Peran & cakupan dibaca ulang dari DB di service.
@Controller("tasks/verification")
@Roles("owner", "admin", "atasan")
export class TaskVerificationController {
  constructor(private readonly verification: TaskVerificationService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(taskVerificationQuerySchema)) query: TaskVerificationQuery,
  ): Promise<ApiResponse<TaskVerificationList>> {
    return { success: true, data: await this.verification.list(user, query) };
  }

  @Post("approve")
  @HttpCode(HttpStatus.OK)
  async bulkApprove(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(taskBulkApproveSchema)) body: TaskBulkApproveInput,
  ): Promise<ApiResponse<TaskBulkApproveResult>> {
    return { success: true, data: await this.verification.bulkApprove(user, body) };
  }

  @Post(":id/decision")
  @HttpCode(HttpStatus.OK)
  async decide(
    @CurrentUser() user: AuthUser,
    @Param("id", LOG_ID) id: string,
    @Body(new ZodValidationPipe(taskDecisionSchema)) body: TaskDecisionData,
  ): Promise<ApiResponse<null>> {
    await this.verification.decide(user, id, body);
    return { success: true, data: null };
  }
}
