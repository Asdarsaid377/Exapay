import { type ApiResponse, MEMBERSHIP_ROLES, type MyKpiReviewList } from "@exapay/shared";
import { Controller, Get } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { KpiReviewsService } from "./kpi-reviews.service.js";

// Penilaian periodik milik sendiri (portal /me/performance, feature 37): hanya yang sudah final. Semua peran.
@Controller("kpi/me/reviews")
@Roles(...MEMBERSHIP_ROLES)
export class MyKpiReviewsController {
  constructor(private readonly reviews: KpiReviewsService) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<ApiResponse<MyKpiReviewList>> {
    return { success: true, data: await this.reviews.mine(user) };
  }
}
