import {
  type ApiResponse,
  type AttendanceHistoryQuery,
  attendanceHistoryQuerySchema,
  type KpiScoreList,
  type KpiScoreQuery,
  kpiScoreQuerySchema,
  MEMBERSHIP_ROLES,
  type MyKpiScore,
} from "@exapay/shared";
import { Controller, Get, Query } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe.js";
import { KpiScoresService } from "./kpi-scores.service.js";

// Skor KPI ad-hoc (feature 21): /kpi/scores owner/admin semua karyawan, atasan bawahan langsung (dicek service);
// /kpi/scores/me skor milik sendiri untuk semua peran yang akunnya tertaut data karyawan.
@Controller("kpi/scores")
export class KpiScoresController {
  constructor(private readonly scores: KpiScoresService) {}

  @Get()
  @Roles("owner", "admin", "atasan")
  async list(@CurrentUser() user: AuthUser, @Query(new ZodValidationPipe(kpiScoreQuerySchema)) query: KpiScoreQuery): Promise<ApiResponse<KpiScoreList>> {
    return { success: true, data: await this.scores.list(user, query) };
  }

  @Get("me")
  @Roles(...MEMBERSHIP_ROLES)
  async mine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attendanceHistoryQuerySchema)) query: AttendanceHistoryQuery,
  ): Promise<ApiResponse<MyKpiScore>> {
    return { success: true, data: await this.scores.mine(user, query) };
  }
}
