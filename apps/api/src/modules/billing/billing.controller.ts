import type { ApiResponse, BillingOverview, SubscriptionSummary } from "@exapay/shared";
import { Controller, Get } from "@nestjs/common";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { CurrentUser } from "../../common/auth/current-user.decorator.js";
import { Roles } from "../../common/auth/roles.decorator.js";
import { BillingService } from "./billing.service.js";

// Langganan usaha aktif (feature 40). GET saja → tetap terbuka saat baca-saja (SubscriptionGuard hanya menahan mutasi).
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // Halaman /settings/billing — khusus owner (build-plan feature 40)
  @Get()
  @Roles("owner")
  async overview(@CurrentUser() user: AuthUser): Promise<ApiResponse<BillingOverview>> {
    return { success: true, data: await this.billingService.overview(user) };
  }

  // Banner pengingat di AppShell — owner & admin
  @Get("status")
  @Roles("owner", "admin")
  async status(@CurrentUser() user: AuthUser): Promise<ApiResponse<SubscriptionSummary>> {
    return { success: true, data: await this.billingService.status(user) };
  }
}
