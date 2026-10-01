import {
  type ApiResponse,
  type FinalizePayrollRunInput,
  finalizePayrollRunSchema,
  type OpenPayrollRunInput,
  openPayrollRunSchema,
  type PayrollAdjustmentInput,
  payrollAdjustmentInputSchema,
  type PayrollEmployeeDetail,
  type PayrollRunDetail,
  type PayrollRunList,
} from "@exapay/shared";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { PayrollRunsService } from "./payroll-runs.service.js";

const RUN_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Periode payroll tidak ditemukan") });
const EMPLOYEE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Karyawan tidak ada di periode payroll ini") });
const ADJUSTMENT_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Penyesuaian tidak ditemukan") });

// Run payroll — draf & review (feature 29): daftar & buka periode, draf per periode & per karyawan, penyesuaian admin.
// Finalisasi (feature 30): snapshot immutable; periode final dibaca dari snapshot.
@Controller("payroll/runs")
@Roles("owner", "admin")
export class PayrollRunsController {
  constructor(private readonly runs: PayrollRunsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<PayrollRunList>> {
    return { success: true, data: await this.runs.list(user) };
  }

  @Post()
  async open(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(openPayrollRunSchema)) body: OpenPayrollRunInput,
  ): Promise<ApiResponse<{ id: string }>> {
    return { success: true, data: await this.runs.open(user, body) };
  }

  @Get(":id")
  async detail(@CurrentUser() user: AuthUser, @Param("id", RUN_ID) id: string): Promise<ApiResponse<PayrollRunDetail>> {
    return { success: true, data: await this.runs.detail(user, id) };
  }

  @Post(":id/finalize")
  @HttpCode(HttpStatus.OK)
  async finalize(
    @CurrentUser() user: AuthUser,
    @Param("id", RUN_ID) id: string,
    @Body(new ZodValidationPipe(finalizePayrollRunSchema)) body: FinalizePayrollRunInput,
  ): Promise<ApiResponse<null>> {
    await this.runs.finalize(user, id, body);
    return { success: true, data: null };
  }

  @Get(":id/employees/:employeeId")
  async employee(
    @CurrentUser() user: AuthUser,
    @Param("id", RUN_ID) id: string,
    @Param("employeeId", EMPLOYEE_ID) employeeId: string,
  ): Promise<ApiResponse<PayrollEmployeeDetail>> {
    return { success: true, data: await this.runs.employeeDetail(user, id, employeeId) };
  }

  @Post(":id/employees/:employeeId/adjustments")
  @HttpCode(HttpStatus.OK)
  async addAdjustment(
    @CurrentUser() user: AuthUser,
    @Param("id", RUN_ID) id: string,
    @Param("employeeId", EMPLOYEE_ID) employeeId: string,
    @Body(new ZodValidationPipe(payrollAdjustmentInputSchema)) body: PayrollAdjustmentInput,
  ): Promise<ApiResponse<null>> {
    await this.runs.addAdjustment(user, id, employeeId, body);
    return { success: true, data: null };
  }

  @Put(":id/adjustments/:adjustmentId")
  async updateAdjustment(
    @CurrentUser() user: AuthUser,
    @Param("id", RUN_ID) id: string,
    @Param("adjustmentId", ADJUSTMENT_ID) adjustmentId: string,
    @Body(new ZodValidationPipe(payrollAdjustmentInputSchema)) body: PayrollAdjustmentInput,
  ): Promise<ApiResponse<null>> {
    await this.runs.updateAdjustment(user, id, adjustmentId, body);
    return { success: true, data: null };
  }

  @Delete(":id/adjustments/:adjustmentId")
  async deleteAdjustment(
    @CurrentUser() user: AuthUser,
    @Param("id", RUN_ID) id: string,
    @Param("adjustmentId", ADJUSTMENT_ID) adjustmentId: string,
  ): Promise<ApiResponse<null>> {
    await this.runs.deleteAdjustment(user, id, adjustmentId);
    return { success: true, data: null };
  }
}
