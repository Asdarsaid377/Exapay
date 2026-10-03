import { type ApiResponse, type SetupGuide, type SetupGuideVisibilityInput, setupGuideVisibilityInputSchema } from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { SetupGuideService } from "./setup-guide.service.js";

// Panduan setup awal (feature 48) — owner/admin; atasan & karyawan 403
@Controller("setup-guide")
@Roles("owner", "admin")
export class SetupGuideController {
  constructor(private readonly guide: SetupGuideService) {}

  @Get()
  async status(@CurrentUser() user: AuthUser): Promise<ApiResponse<SetupGuide>> {
    return { success: true, data: await this.guide.status(user) };
  }

  @Put("visibility")
  async visibility(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setupGuideVisibilityInputSchema)) body: SetupGuideVisibilityInput,
  ): Promise<ApiResponse<SetupGuide>> {
    return { success: true, data: await this.guide.setHidden(user, body.hidden) };
  }

  @Post("schedule-checked")
  @HttpCode(HttpStatus.OK)
  async scheduleChecked(@CurrentUser() user: AuthUser): Promise<ApiResponse<SetupGuide>> {
    return { success: true, data: await this.guide.markScheduleChecked(user) };
  }

  @Post("close")
  @HttpCode(HttpStatus.OK)
  async close(@CurrentUser() user: AuthUser): Promise<ApiResponse<SetupGuide>> {
    return { success: true, data: await this.guide.close(user) };
  }
}
