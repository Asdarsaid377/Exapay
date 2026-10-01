import {
  type ApiResponse,
  type JkkRiskLevelInput,
  jkkRiskLevelInputSchema,
  type SalaryComponentInput,
  salaryComponentInputSchema,
  type SalaryComponentSettings,
} from "@exapay/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { SalaryComponentsService } from "./salary-components.service.js";

const COMPONENT_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Komponen gaji tidak ditemukan") });

// Katalog komponen gaji & kelompok risiko JKK (feature 28, /settings/salary-components). Setiap aksi mengembalikan
// pengaturan terbaru.
@Controller("salary-components")
@Roles("owner", "admin")
export class SalaryComponentsController {
  constructor(private readonly components: SalaryComponentsService) {}

  @Get()
  async settings(@CurrentUser() user: AuthUser): Promise<ApiResponse<SalaryComponentSettings>> {
    return { success: true, data: await this.components.settings(user) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(salaryComponentInputSchema)) body: SalaryComponentInput,
  ): Promise<ApiResponse<SalaryComponentSettings>> {
    return { success: true, data: await this.components.create(user, body) };
  }

  @Put("jkk-risk-level")
  async setJkkRiskLevel(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(jkkRiskLevelInputSchema)) body: JkkRiskLevelInput,
  ): Promise<ApiResponse<SalaryComponentSettings>> {
    return { success: true, data: await this.components.setJkkRiskLevel(user, body) };
  }

  @Put(":id")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", COMPONENT_ID) id: string,
    @Body(new ZodValidationPipe(salaryComponentInputSchema)) body: SalaryComponentInput,
  ): Promise<ApiResponse<SalaryComponentSettings>> {
    return { success: true, data: await this.components.update(user, id, body) };
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.OK)
  async archive(@CurrentUser() user: AuthUser, @Param("id", COMPONENT_ID) id: string): Promise<ApiResponse<SalaryComponentSettings>> {
    return { success: true, data: await this.components.archive(user, id) };
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  async restore(@CurrentUser() user: AuthUser, @Param("id", COMPONENT_ID) id: string): Promise<ApiResponse<SalaryComponentSettings>> {
    return { success: true, data: await this.components.restore(user, id) };
  }

  @Delete(":id")
  async remove(@CurrentUser() user: AuthUser, @Param("id", COMPONENT_ID) id: string): Promise<ApiResponse<SalaryComponentSettings>> {
    return { success: true, data: await this.components.remove(user, id) };
  }
}
