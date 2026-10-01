import {
  type ApiResponse,
  type CompanyProfile,
  type MinimumWageAlertsInput,
  minimumWageAlertsSchema,
  type UpdateCompanyProfile,
  updateCompanyProfileSchema,
} from "@exapay/shared";
import { Body, Controller, Get, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { CompanyService } from "./company.service.js";

// Profil usaha aktif (feature 09, /settings/company)
@Controller("company")
@Roles("owner", "admin")
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  async get(@CurrentUser() user: AuthUser): Promise<ApiResponse<CompanyProfile>> {
    return { success: true, data: await this.companyService.get(user) };
  }

  @Put()
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateCompanyProfileSchema)) body: UpdateCompanyProfile,
  ): Promise<ApiResponse<CompanyProfile>> {
    return { success: true, data: await this.companyService.update(user, body) };
  }

  // Peringatan upah minimum (bawaan mati) — hanya owner; @Roles di method menimpa @Roles kelas
  @Put("minimum-wage-alerts")
  @Roles("owner")
  async setMinimumWageAlerts(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(minimumWageAlertsSchema)) body: MinimumWageAlertsInput,
  ): Promise<ApiResponse<CompanyProfile>> {
    return { success: true, data: await this.companyService.setMinimumWageAlerts(user, body.enabled) };
  }
}
