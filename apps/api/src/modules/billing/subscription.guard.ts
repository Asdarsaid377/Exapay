import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ALLOW_WHEN_READ_ONLY_KEY } from "../../common/auth/allow-when-read-only.decorator.js";
import type { AuthenticatedRequest } from "../../common/auth/auth-user.js";
import { IS_PUBLIC_KEY } from "../../common/auth/public.decorator.js";
import { SubscriptionsService } from "./subscriptions.service.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const MANAGER_MESSAGE =
  "Masa trial atau langganan usaha ini telah berakhir. Data masih bisa dilihat dan diekspor, tetapi tidak bisa diubah sampai langganan diaktifkan kembali.";
const MEMBER_MESSAGE = "Usaha Anda sedang dalam mode baca-saja karena langganan belum diperpanjang. Hubungi pemilik usaha Anda.";

// Global, setelah JwtAuthGuard & RolesGuard (urutan APP_GUARD di AuthModule). Mode baca-saja: semua mutasi dari
// anggota usaha ditolak 402 + code SUBSCRIPTION_READ_ONLY, kecuali @AllowWhenReadOnly. Super-admin tidak terpengaruh.
@Injectable()
export class SubscriptionGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionGuard.name);
  // Peringatan "tanpa baris langganan" cukup sekali per tenant per proses
  private readonly warnedTenants = new Set<string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (READ_METHODS.has(request.method)) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_WHEN_READ_ONLY_KEY, targets)) return true;

    const user = request.user;
    if (!user?.tenantId || user.isSuperAdmin) return true;

    const state = await this.subscriptions.stateOf({ tenantId: user.tenantId, userId: user.userId });
    if (!state) {
      if (!this.warnedTenants.has(user.tenantId)) {
        this.warnedTenants.add(user.tenantId);
        this.logger.warn(`[billing/guard] tenant ${user.tenantId} tanpa baris langganan — diizinkan`);
      }
      return true;
    }
    if (state.writable) return true;

    const message = user.role === "owner" || user.role === "admin" ? MANAGER_MESSAGE : MEMBER_MESSAGE;
    throw new HttpException({ message, code: "SUBSCRIPTION_READ_ONLY" }, HttpStatus.PAYMENT_REQUIRED);
  }
}
