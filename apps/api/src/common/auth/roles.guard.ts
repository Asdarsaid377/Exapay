import type { MembershipRole } from "@exapay/shared";
import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "./auth-user.js";
import { ROLES_KEY } from "./roles.decorator.js";
import { SUPER_ADMIN_KEY } from "./super-admin.decorator.js";

// Terdaftar global setelah JwtAuthGuard. Tanpa @Roles/@SuperAdmin → cukup login.
// Aturan "atasan hanya melihat bawahannya" dicek di service, bukan di sini.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const superAdminOnly = this.reflector.getAllAndOverride<boolean | undefined>(SUPER_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (superAdminOnly) {
      const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
      if (!user?.isSuperAdmin) throw new ForbiddenException("Anda tidak memiliki akses ke fitur ini");
      return true;
    }

    const roles = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user?.tenantId || !user.role) {
      throw new ForbiddenException("Pilih usaha terlebih dahulu");
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException("Anda tidak memiliki akses ke fitur ini");
    }
    return true;
  }
}
