import { randomUUID } from "node:crypto";

import { memberships, tenants, users } from "@exapay/db";
import type { SignupInput } from "@exapay/shared";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { sql } from "drizzle-orm";
import type { Redis } from "ioredis";

import type { Env } from "../../common/config/env.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type TenantContext, withTenant } from "../../database/tenant-transaction.js";
import { REDIS_CLIENT } from "../../redis/redis.module.js";
import { AuditService } from "../audit/audit.service.js";
import { EmailService } from "../email/email.service.js";
import { seedTenantDefaults } from "../tenants/tenant-defaults.js";
import { AuthService } from "./auth.service.js";
import { EmailVerificationService } from "./email-verification.service.js";

// Email "akun sudah ada" paling banyak sekali per jendela ini per alamat (anti-spam ke inbox korban)
const EXISTING_NOTICE_COOLDOWN_SECONDS = 60 * 60;

type AccountLookup = { id: string; email_verified_at: Date | null };

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly authService: AuthService,
    private readonly verification: EmailVerificationService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Selalu selesai dengan respons yang sama agar tidak membocorkan apakah email sudah terdaftar:
  // - email baru → akun + usaha + membership owner dibuat dalam satu transaksi, email verifikasi dikirim
  // - sudah terdaftar, belum terverifikasi → kirim ulang email verifikasi (data form diabaikan)
  // - sudah terdaftar & terverifikasi → email pemberitahuan berisi tautan masuk / lupa password
  async signup(input: SignupInput): Promise<void> {
    // Hash dihitung di semua jalur agar waktu respons tidak membedakan email baru/terdaftar
    const passwordHash = await this.authService.hashPassword(input.password);

    const { rows } = await this.db.execute<AccountLookup>(
      sql`select id, email_verified_at from auth_find_user_by_email(${input.email})`,
    );
    const existing = rows[0];
    if (existing) {
      await this.handleExisting(input.email, existing);
      return;
    }

    // Id dibuat di app agar konteks RLS (tenant & user) bisa di-set sebelum baris-barisnya ada
    const userId = randomUUID();
    const ctx: TenantContext = { tenantId: randomUUID(), userId };
    let token: string;
    try {
      token = await withTenant(this.db, ctx, async (tx) => {
        await tx.insert(users).values({ id: userId, email: input.email, fullName: input.fullName, passwordHash });
        await tx.insert(tenants).values({ id: ctx.tenantId, name: input.companyName });
        await tx.insert(memberships).values({ tenantId: ctx.tenantId, userId, role: "owner" });
        await seedTenantDefaults(tx, ctx);
        await this.audit.record(tx, ctx, {
          entity: "tenant",
          entityId: ctx.tenantId,
          action: "signup",
          after: { name: input.companyName, ownerUserId: userId },
        });
        return this.verification.createToken(tx, userId);
      });
    } catch (error: unknown) {
      // Pendaftaran paralel dengan email yang sama: yang kalah diperlakukan seperti email sudah terdaftar
      if (isUniqueViolation(error)) return;
      throw error;
    }
    this.verification.sendLink(input.email, token);
  }

  private async handleExisting(email: string, account: AccountLookup): Promise<void> {
    if (!account.email_verified_at) {
      await this.verification.resend(email);
      return;
    }

    try {
      const first = await this.redis.set(`signup:existing-notice:${email.toLowerCase()}`, "1", "EX", EXISTING_NOTICE_COOLDOWN_SECONDS, "NX");
      if (first !== "OK") return;
    } catch (error: unknown) {
      // Redis mati: lewati pemberitahuan (bukan email penting) daripada membuka celah spam
      this.logger.warn(`[auth/signup] cooldown pemberitahuan tidak bisa dicek: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const webUrl = this.config.get("APP_WEB_URL", { infer: true });
    // TODO(feature antrean): pindahkan ke BullMQ agar tahan restart & bisa retry.
    void this.email
      .send({
        to: email,
        subject: "Email Anda sudah terdaftar di Exapay",
        text: [
          "Halo,",
          "",
          "Seseorang (mungkin Anda) mencoba mendaftar di Exapay dengan email ini, padahal email ini sudah memiliki akun.",
          "",
          `Masuk ke akun Anda: ${webUrl}/login`,
          `Lupa password? Atur ulang di: ${webUrl}/forgot-password`,
          "",
          "Jika bukan Anda, abaikan email ini — akun Anda tetap aman.",
        ].join("\n"),
      })
      .catch((error: unknown) => {
        this.logger.error(`[auth/signup] email pemberitahuan gagal: ${error instanceof Error ? error.message : String(error)}`);
      });
  }
}
