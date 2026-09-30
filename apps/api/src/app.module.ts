import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { envSchema } from "./common/config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CompanyModule } from "./modules/company/company.module.js";
import { EmailModule } from "./modules/email/email.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { InvitationsModule } from "./modules/invitations/invitations.module.js";
import { OrganizationModule } from "./modules/organization/organization.module.js";
import { RegionsModule } from "./modules/regions/regions.module.js";
import { TenantsModule } from "./modules/tenants/tenants.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { RedisModule } from "./redis/redis.module.js";

@Module({
  imports: [
    // Env dibaca dari process.env (Docker Compose / `node --env-file`), divalidasi zod
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validationSchema: envSchema }),
    DatabaseModule,
    AuditModule,
    EmailModule,
    AuthModule,
    InvitationsModule,
    TenantsModule,
    UsersModule,
    CompanyModule,
    RegionsModule,
    OrganizationModule,
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
