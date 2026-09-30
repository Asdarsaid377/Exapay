import { type ApiResponse, type KpiTemplateData, kpiTemplateInputSchema, type KpiTemplateOverview } from "@exapay/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { KpiTemplatesService } from "./kpi-templates.service.js";

const TEMPLATE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Template KPI tidak ditemukan") });

// Template KPI per jabatan (feature 18, /kpi/templates) — hanya owner/admin (atasan tidak melihat menu Template KPI)
@Controller("kpi/templates")
@Roles("owner", "admin")
export class KpiTemplatesController {
  constructor(private readonly kpiTemplatesService: KpiTemplatesService) {}

  @Get()
  async overview(@CurrentUser() user: AuthUser): Promise<ApiResponse<KpiTemplateOverview>> {
    return { success: true, data: await this.kpiTemplatesService.overview(user) };
  }

  @Post()
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(kpiTemplateInputSchema)) body: KpiTemplateData): Promise<ApiResponse<{ id: string }>> {
    return { success: true, data: await this.kpiTemplatesService.create(user, body) };
  }

  // Tambahkan kembali template bawaan yang belum ada
  @Post("builtin")
  @HttpCode(HttpStatus.OK)
  async addBuiltins(@CurrentUser() user: AuthUser): Promise<ApiResponse<{ added: number }>> {
    return { success: true, data: await this.kpiTemplatesService.addBuiltins(user) };
  }

  @Put(":id")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", TEMPLATE_ID) id: string,
    @Body(new ZodValidationPipe(kpiTemplateInputSchema)) body: KpiTemplateData,
  ): Promise<ApiResponse<{ id: string }>> {
    return { success: true, data: await this.kpiTemplatesService.update(user, id, body) };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: AuthUser, @Param("id", TEMPLATE_ID) id: string): Promise<ApiResponse<null>> {
    await this.kpiTemplatesService.remove(user, id);
    return { success: true, data: null };
  }
}
