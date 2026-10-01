import type { ApiResponse, OwnerDashboard, SupervisorDashboard } from "@exapay/shared";
import { Controller, Get } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { DashboardService } from "./dashboard.service.js";

// Dashboard owner/admin (feature 35) & atasan (feature 36, /dashboard/team — @Roles method menimpa @Roles kelas).
@Controller("dashboard")
@Roles("owner", "admin")
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  async owner(@CurrentUser() user: AuthUser): Promise<ApiResponse<OwnerDashboard>> {
    return { success: true, data: await this.dashboard.owner(user) };
  }

  @Get("team")
  @Roles("atasan")
  async team(@CurrentUser() user: AuthUser): Promise<ApiResponse<SupervisorDashboard>> {
    return { success: true, data: await this.dashboard.team(user) };
  }
}
