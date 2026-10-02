import { Module } from "@nestjs/common";

import { SubscriptionsService } from "./subscriptions.service.js";

// Langganan & trial (Phase 9). SubscriptionGuard didaftarkan di AuthModule (urutan APP_GUARD setelah autentikasi & peran).
@Module({
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class BillingModule {}
