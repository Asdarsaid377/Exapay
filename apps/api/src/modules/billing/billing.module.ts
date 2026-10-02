import { Module } from "@nestjs/common";

import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { PaymentProvider, QrisManualPaymentProvider } from "./payment-provider.js";
import { SubscriptionsService } from "./subscriptions.service.js";

// Langganan & trial (Phase 9). SubscriptionGuard didaftarkan di AuthModule (urutan APP_GUARD setelah autentikasi & peran).
// Cara bayar di balik PaymentProvider (feature 41: qris-manual).
@Module({
  controllers: [BillingController],
  providers: [SubscriptionsService, BillingService, { provide: PaymentProvider, useClass: QrisManualPaymentProvider }],
  exports: [SubscriptionsService],
})
export class BillingModule {}
