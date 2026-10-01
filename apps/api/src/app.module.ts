import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { envSchema } from "./common/config/env.js";
import { CryptoModule } from "./common/crypto/crypto.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { AttendanceModule } from "./modules/attendance/attendance.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CompanyModule } from "./modules/company/company.module.js";
import { ComplianceModule } from "./modules/compliance/compliance.module.js";
import { EmailModule } from "./modules/email/email.module.js";
import { EmployeesModule } from "./modules/employees/employees.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { InvitationsModule } from "./modules/invitations/invitations.module.js";
import { KpiModule } from "./modules/kpi/kpi.module.js";
import { OrganizationModule } from "./modules/organization/organization.module.js";
import { PayrollModule } from "./modules/payroll/payroll.module.js";
import { RegionsModule } from "./modules/regions/regions.module.js";
import { RegulationsModule } from "./modules/regulations/regulations.module.js";
import { StorageModule } from "./modules/storage/storage.module.js";
import { TasksModule } from "./modules/tasks/tasks.module.js";
import { TenantsModule } from "./modules/tenants/tenants.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { RedisModule } from "./redis/redis.module.js";

@Module({
  imports: [
    // Env dibaca dari process.env (Docker Compose / `node --env-file`), divalidasi zod
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validationSchema: envSchema }),
    DatabaseModule,
    CryptoModule,
    AuditModule,
    EmailModule,
    StorageModule,
    AuthModule,
    InvitationsModule,
    TenantsModule,
    UsersModule,
    CompanyModule,
    RegionsModule,
    RegulationsModule,
    OrganizationModule,
    EmployeesModule,
    AttendanceModule,
    KpiModule,
    TasksModule,
    PayrollModule,
    ComplianceModule,
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
