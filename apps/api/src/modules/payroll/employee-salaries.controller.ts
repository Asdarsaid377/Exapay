import { type ApiResponse, type EmployeeSalaryOverview, type SaveEmployeeSalaryData, saveEmployeeSalarySchema } from "@exapay/shared";
import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { EmployeeSalariesService } from "./employee-salaries.service.js";

const EMPLOYEE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Karyawan tidak ditemukan") });

// Gaji karyawan berlaku-tanggal (feature 28, tab Gaji /employees/[id]): riwayat versi + simpan versi baru.
@Controller("employees/:id/salary")
@Roles("owner", "admin")
export class EmployeeSalariesController {
  constructor(private readonly salaries: EmployeeSalariesService) {}

  @Get()
  async overview(@CurrentUser() user: AuthUser, @Param("id", EMPLOYEE_ID) id: string): Promise<ApiResponse<EmployeeSalaryOverview>> {
    return { success: true, data: await this.salaries.overview(user, id) };
  }

  @Post()
  async save(
    @CurrentUser() user: AuthUser,
    @Param("id", EMPLOYEE_ID) id: string,
    @Body(new ZodValidationPipe(saveEmployeeSalarySchema)) body: SaveEmployeeSalaryData,
  ): Promise<ApiResponse<EmployeeSalaryOverview>> {
    return { success: true, data: await this.salaries.save(user, id, body) };
  }
}
