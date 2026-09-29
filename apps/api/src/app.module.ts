import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { envSchema } from "./common/config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { RedisModule } from "./redis/redis.module.js";

@Module({
  imports: [
    // Env dibaca dari process.env (Docker Compose / `node --env-file`), divalidasi zod
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validationSchema: envSchema }),
    DatabaseModule,
    AuditModule,
    RedisModule,
    HealthModule,
  ],
})
export class AppModule {}
