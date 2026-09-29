import { MEMBERSHIP_ROLES, type MembershipRole } from "@exapay/shared";
import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";

import type { Env } from "../config/env.js";
import { ACCESS_COOKIE, type AuthenticatedRequest, type AuthUser, readCookie } from "./auth-user.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === "string" && (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

// Terdaftar global (APP_GUARD). Token dari header `Authorization: Bearer` (mobile) atau cookie httpOnly (web).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException("Silakan login terlebih dahulu");

    request.user = await this.verify(token);
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const header = request.headers.authorization;
    if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim() || null;

    return readCookie(request, ACCESS_COOKIE);
  }

  private async verify(token: string): Promise<AuthUser> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        algorithms: ["HS256"],
      });
    } catch {
      throw new UnauthorizedException("Sesi berakhir, silakan login kembali");
    }

    const { sub, tid, role, sa } = payload;
    if (typeof sub !== "string" || typeof sa !== "boolean") {
      throw new UnauthorizedException("Sesi tidak valid, silakan login kembali");
    }
    const tenantId = typeof tid === "string" ? tid : null;
    const tenantRole = isMembershipRole(role) ? role : null;
    return {
      userId: sub,
      isSuperAdmin: sa,
      // Tenant hanya dianggap aktif jika peran juga ada
      tenantId: tenantRole ? tenantId : null,
      role: tenantId ? tenantRole : null,
    };
  }
}
