import { Module } from "@nestjs/common";

import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { SubscriptionsService } from "./subscriptions.service.js";

// Langganan & trial (Phase 9). SubscriptionGuard didaftarkan di AuthModule (urutan APP_GUARD setelah autentikasi & peran).
@Module({
  controllers: [BillingController],
  providers: [SubscriptionsService, BillingService],
  exports: [SubscriptionsService],
})
export class BillingModule {}
