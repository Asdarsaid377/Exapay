import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";

import { JwtAuthGuard } from "../../common/auth/jwt-auth.guard.js";
import { RolesGuard } from "../../common/auth/roles.guard.js";
import { AuthController } from "./auth.controller.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import { AuthService } from "./auth.service.js";
import { EmailVerificationService } from "./email-verification.service.js";
import { PasswordResetService } from "./password-reset.service.js";
import { SignupService } from "./signup.service.js";

@Module({
  // Secret diberikan per panggilan (access & refresh memakai secret berbeda)
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRateLimitService,
    PasswordResetService,
    EmailVerificationService,
    SignupService,
    // Global, berurutan: autentikasi dulu, lalu peran. Endpoint publik ditandai @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
