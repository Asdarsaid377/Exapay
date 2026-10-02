import type { ApiResponse, PublicBillingPrice } from "@exapay/shared";
import { Controller, Get } from "@nestjs/common";

import { Public } from "../../common/auth/public.decorator.js";
import { BillingService } from "./billing.service.js";

// Data harga untuk landing page publik `/` (feature 43) — tanpa login, hanya harga platform yang berlaku
// (tanpa data usaha mana pun). Web men-cache respons ini (lib/api/publicPricing.ts).
@Controller("billing/public")
@Public()
export class BillingPublicController {
  constructor(private readonly billingService: BillingService) {}

  @Get("price")
  async price(): Promise<ApiResponse<PublicBillingPrice>> {
    return { success: true, data: await this.billingService.publicPrice() };
  }
}
