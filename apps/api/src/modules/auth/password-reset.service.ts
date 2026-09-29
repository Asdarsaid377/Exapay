import { createHash, randomBytes } from "node:crypto";

import { passwordResetTokens, refreshTokens, users } from "@exapay/db";
import { GoneException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { Env } from "../../common/config/env.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, withUser } from "../../database/tenant-transaction.js";
import { EmailService } from "../email/email.service.js";
import { AuthService } from "./auth.service.js";

export const RESET_TOKEN_TTL_MINUTES = 60;
// Permintaan berulang dalam jendela ini tidak mengirim email baru (anti-spam ke inbox korban)
const RESEND_COOLDOWN_SECONDS = 60;

type ResetLookup = { id: string; user_id: string };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly authService: AuthService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Selalu selesai tanpa error agar respons tidak membocorkan apakah email terdaftar.
  async request(email: string): Promise<void> {
    const { rows } = await this.db.execute<{ id: string }>(sql`select id from auth_find_user_by_email(${email})`);
    const account = rows[0];
    if (!account) return;

    const token = randomBytes(32).toString("base64url");
    const created = await withUser(this.db, account.id, async (tx) => {
      const [recent] = await tx
        .select({ id: passwordResetTokens.id })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, account.id),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.createdAt, new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000)),
          ),
        );
      if (recent) return false;

      // Hanya tautan terbaru yang berlaku
      await tx.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, account.id), isNull(passwordResetTokens.usedAt)));
      await tx.insert(passwordResetTokens).values({
        userId: account.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000),
      });
      return true;
    });
    if (!created) return;

    // Dikirim di latar agar waktu respons sama untuk email terdaftar/tidak.
    // TODO(feature antrean): pindahkan ke BullMQ agar tahan restart & bisa retry.
    const link = `${this.config.get("APP_WEB_URL", { infer: true })}/reset-password?token=${token}`;
    void this.email
      .send({
        to: email,
        subject: "Atur ulang password Exapay",
        text: [
          "Halo,",
          "",
          "Kami menerima permintaan untuk mengatur ulang password akun Exapay Anda.",
          `Buka tautan berikut untuk membuat password baru (berlaku ${RESET_TOKEN_TTL_MINUTES} menit):`,
          "",
          link,
          "",
          "Jika Anda tidak meminta ini, abaikan email ini — password Anda tidak berubah.",
        ].join("\n"),
      })
      .catch((error: unknown) => {
        this.logger.error(`[auth/forgot-password] email reset gagal: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  // Ganti password dari tautan reset, lalu akhiri semua sesi user (refresh token dicabut).
  async reset(token: string, password: string): Promise<void> {
    const { rows } = await this.db.execute<ResetLookup>(
      sql`select id, user_id from auth_find_password_reset(${hashToken(token)})`,
    );
    const lookup = rows[0];
    if (!lookup) throw new GoneException("Tautan reset tidak valid atau sudah kedaluwarsa");

    const passwordHash = await this.authService.hashPassword(password);

    await withUser(this.db, lookup.user_id, async (tx) => {
      const [row] = await tx
        .select({ usedAt: passwordResetTokens.usedAt, expiresAt: passwordResetTokens.expiresAt })
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.id, lookup.id))
        .for("update");
      if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
        throw new GoneException("Tautan reset tidak valid atau sudah kedaluwarsa");
      }

      const now = new Date();
      await tx.update(users).set({ passwordHash }).where(eq(users.id, lookup.user_id));
      await tx.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, lookup.id));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.userId, lookup.user_id), isNull(refreshTokens.revokedAt)));
    });
  }
}
