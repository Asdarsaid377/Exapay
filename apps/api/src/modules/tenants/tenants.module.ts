import { Module } from "@nestjs/common";

import { BillingModule } from "../billing/billing.module.js";
import { InvitationsModule } from "../invitations/invitations.module.js";
import { TenantsAdminController } from "./tenants-admin.controller.js";
import { TenantsAdminService } from "./tenants-admin.service.js";

@Module({
  imports: [InvitationsModule, BillingModule],
  controllers: [TenantsAdminController],
  providers: [TenantsAdminService],
})
export class TenantsModule {}
