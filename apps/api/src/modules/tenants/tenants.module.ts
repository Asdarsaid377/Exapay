import { Module } from "@nestjs/common";

import { InvitationsModule } from "../invitations/invitations.module.js";
import { TenantsAdminController } from "./tenants-admin.controller.js";
import { TenantsAdminService } from "./tenants-admin.service.js";

@Module({
  imports: [InvitationsModule],
  controllers: [TenantsAdminController],
  providers: [TenantsAdminService],
})
export class TenantsModule {}
