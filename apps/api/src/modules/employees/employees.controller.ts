import {
  type ApiResponse,
  type DeactivateEmployeeInput,
  deactivateEmployeeSchema,
  type EmployeeDetail,
  type EmployeeFormOptions,
  type EmployeeInput,
  employeeInputSchema,
  type EmployeeList,
  type EmployeeListQuery,
  employeeListQuerySchema,
  type RevealedSensitive,
  type RevealSensitiveInput,
  revealSensitiveSchema,
} from "@exapay/shared";
import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query } from "@nestjs/common";
import { z } from "zod";

import { AllowWhenReadOnly } from "../../common/auth/allow-when-read-only.decorator.js";
import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { EmployeesService } from "./employees.service.js";

const EMPLOYEE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Karyawan tidak ditemukan") });
const optionsQuerySchema = z.object({ excludeId: z.uuid().nullable().catch(null) });

// Data karyawan (feature 11, /employees). Atasan hanya melihat bawahan langsung (dicek di service);
// mutasi & data sensitif hanya owner/admin — peran dibaca ulang dari DB di service.
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles("owner", "admin", "atasan")
  async list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(employeeListQuerySchema)) query: EmployeeListQuery): Promise<ApiResponse<EmployeeList>> {
    return { success: true, data: await this.employeesService.list(user, query) };
  }

  @Get("options")
  @Roles("owner", "admin")
  async options(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(optionsQuerySchema)) query: z.output<typeof optionsQuerySchema>,
  ): Promise<ApiResponse<EmployeeFormOptions>> {
    return { success: true, data: await this.employeesService.formOptions(user, query.excludeId) };
  }

  @Get(":id")
  @Roles("owner", "admin", "atasan")
  async detail(@CurrentUser() user: AuthUser, @Param("id", EMPLOYEE_ID) id: string): Promise<ApiResponse<EmployeeDetail>> {
    return { success: true, data: await this.employeesService.detail(user, id) };
  }

  @Post()
  @Roles("owner", "admin")
  async create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(employeeInputSchema)) body: EmployeeInput): Promise<ApiResponse<{ id: string }>> {
    return { success: true, data: await this.employeesService.create(user, body) };
  }

  @Put(":id")
  @Roles("owner", "admin")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id", EMPLOYEE_ID) id: string,
    @Body(new ZodValidationPipe(employeeInputSchema)) body: EmployeeInput,
  ): Promise<ApiResponse<null>> {
    await this.employeesService.update(user, id, body);
    return { success: true, data: null };
  }

  @Post(":id/deactivate")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @CurrentUser() user: AuthUser,
    @Param("id", EMPLOYEE_ID) id: string,
    @Body(new ZodValidationPipe(deactivateEmployeeSchema)) body: DeactivateEmployeeInput,
  ): Promise<ApiResponse<null>> {
    await this.employeesService.deactivate(user, id, body);
    return { success: true, data: null };
  }

  @Post(":id/reactivate")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async reactivate(@CurrentUser() user: AuthUser, @Param("id", EMPLOYEE_ID) id: string): Promise<ApiResponse<null>> {
    await this.employeesService.reactivate(user, id);
    return { success: true, data: null };
  }

  // POST (bukan GET): membuka data sensitif adalah aksi yang dicatat, tidak boleh di-prefetch/di-cache
  // Hanya membuka data (audit dicatat) — tetap boleh saat baca-saja
  @AllowWhenReadOnly()
  @Post(":id/reveal")
  @Roles("owner", "admin")
  @HttpCode(HttpStatus.OK)
  async reveal(
    @CurrentUser() user: AuthUser,
    @Param("id", EMPLOYEE_ID) id: string,
    @Body(new ZodValidationPipe(revealSensitiveSchema)) body: RevealSensitiveInput,
  ): Promise<ApiResponse<RevealedSensitive>> {
    return { success: true, data: await this.employeesService.reveal(user, id, body.section) };
  }
}
