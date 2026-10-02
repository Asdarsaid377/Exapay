import { Module } from "@nestjs/common";

import { BillingAdminController } from "./billing-admin.controller.js";
import { BillingAdminService } from "./billing-admin.service.js";
import { BillingDecisionsService } from "./billing-decisions.service.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { PaymentConfirmationsController } from "./payment-confirmations.controller.js";
import { PaymentConfirmationsService } from "./payment-confirmations.service.js";
import { PaymentProvider, QrisManualPaymentProvider } from "./payment-provider.js";
import { SubscriptionsService } from "./subscriptions.service.js";

// Langganan & trial (Phase 9). SubscriptionGuard didaftarkan di AuthModule (urutan APP_GUARD setelah autentikasi & peran).
// Cara bayar di balik PaymentProvider (feature 41: qris-manual). Konfirmasi pembayaran: dashboard super-admin &
// tautan email tanpa login (feature 42) — keduanya lewat BillingDecisionsService.
@Module({
  controllers: [BillingController, BillingAdminController, PaymentConfirmationsController],
  providers: [
    SubscriptionsService,
    BillingService,
    BillingDecisionsService,
    BillingAdminService,
    PaymentConfirmationsService,
    { provide: PaymentProvider, useClass: QrisManualPaymentProvider },
  ],
  exports: [SubscriptionsService],
})
export class BillingModule {}
