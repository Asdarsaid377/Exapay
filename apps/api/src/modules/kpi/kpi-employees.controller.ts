import {
  type ApiResponse,
  type AttendanceHistoryQuery,
  attendanceHistoryQuerySchema,
  type EmployeeKpiReview,
  type EmployeeKpiScore,
} from "@exapay/shared";
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { KpiReviewsService } from "./kpi-reviews.service.js";
import { KpiScoresService } from "./kpi-scores.service.js";

const EMPLOYEE_ID = new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException("Karyawan tidak ditemukan") });

// KPI satu karyawan — tab KPI detail karyawan /employees/[id] (feature 37b). Atasan hanya bawahan langsung (dicek service).
@Controller("kpi/employees/:employeeId")
@Roles("owner", "admin", "atasan")
export class KpiEmployeesController {
  constructor(
    private readonly scores: KpiScoresService,
    private readonly reviews: KpiReviewsService,
  ) {}

  @Get("score")
  async score(
    @CurrentUser() user: AuthUser,
    @Param("employeeId", EMPLOYEE_ID) employeeId: string,
    @Query(new ZodValidationPipe(attendanceHistoryQuerySchema)) query: AttendanceHistoryQuery,
  ): Promise<ApiResponse<EmployeeKpiScore>> {
    return { success: true, data: await this.scores.employeeScore(user, employeeId, query) };
  }

  @Get("reviews")
  async reviewList(@CurrentUser() user: AuthUser, @Param("employeeId", EMPLOYEE_ID) employeeId: string): Promise<ApiResponse<EmployeeKpiReview[]>> {
    return { success: true, data: await this.reviews.employeeReviews(user, employeeId) };
  }
}
