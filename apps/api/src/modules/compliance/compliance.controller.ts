import {
  type ApiResponse,
  type ComplianceCalendar,
  type ComplianceQuery,
  complianceQuerySchema,
  type ComplianceReminderActionInput,
  complianceReminderActionSchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { ComplianceService } from "./compliance.service.js";

// Kalender kepatuhan (feature 33) — owner/admin: pengingat per bulan + yang terlewat, tandai selesai / batalkan.
@Controller("compliance")
@Roles("owner", "admin")
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get()
  async calendar(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(complianceQuerySchema)) query: ComplianceQuery): Promise<ApiResponse<ComplianceCalendar>> {
    return { success: true, data: await this.compliance.calendar(user, query.month ?? null) };
  }

  @Post("reminders/complete")
  @HttpCode(HttpStatus.OK)
  async complete(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(complianceReminderActionSchema)) body: ComplianceReminderActionInput): Promise<ApiResponse<null>> {
    await this.compliance.complete(user, body.key);
    return { success: true, data: null };
  }

  @Post("reminders/reopen")
  @HttpCode(HttpStatus.OK)
  async reopen(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(complianceReminderActionSchema)) body: ComplianceReminderActionInput): Promise<ApiResponse<null>> {
    await this.compliance.reopen(user, body.key);
    return { success: true, data: null };
  }
}
