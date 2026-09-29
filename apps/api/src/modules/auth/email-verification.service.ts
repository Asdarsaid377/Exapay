import { createHash, randomBytes } from "node:crypto";

import { emailVerificationTokens, users } from "@exapay/db";
import { GoneException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { Env } from "../../common/config/env.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type Transaction, withUser } from "../../database/tenant-transaction.js";
import { EmailService } from "../email/email.service.js";

export const VERIFICATION_TOKEN_TTL_HOURS = 24;
// Permintaan kirim ulang dalam jendela ini tidak mengirim email baru (anti-spam ke inbox korban)
const RESEND_COOLDOWN_SECONDS = 60;

type VerificationLookup = { id: string; user_id: string };
type AccountLookup = { id: string; email_verified_at: Date | null };

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Buat token baru di transaksi pemanggil (konteks app.user_id = userId). Hanya tautan terbaru yang berlaku.
  // Mengembalikan token asli — hanya untuk dikirim lewat email, tidak disimpan.
  async createToken(tx: Transaction, userId: string): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await tx
      .delete(emailVerificationTokens)
      .where(and(eq(emailVerificationTokens.userId, userId), isNull(emailVerificationTokens.usedAt)));
    await tx.insert(emailVerificationTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000),
    });
    return token;
  }

  // Dikirim di latar agar respons tidak menunggu SMTP.
  // TODO(feature antrean): pindahkan ke BullMQ agar tahan restart & bisa retry.
  sendLink(to: string, token: string): void {
    const link = `${this.config.get("APP_WEB_URL", { infer: true })}/verify-email?token=${token}`;
    void this.email
      .send({
        to,
        subject: "Verifikasi email akun Exapay",
        text: [
          "Halo,",
          "",
          "Terima kasih telah mendaftarkan usaha Anda di Exapay.",
          `Buka tautan berikut untuk memverifikasi email Anda (berlaku ${VERIFICATION_TOKEN_TTL_HOURS} jam):`,
          "",
          link,
          "",
          "Jika Anda tidak mendaftar di Exapay, abaikan email ini.",
        ].join("\n"),
      })
      .catch((error: unknown) => {
        this.logger.error(`[auth/verify-email] email verifikasi gagal: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  // Selalu selesai tanpa error agar respons tidak membocorkan apakah email terdaftar / sudah terverifikasi.
  async resend(email: string): Promise<void> {
    const { rows } = await this.db.execute<AccountLookup>(sql`select id, email_verified_at from auth_find_user_by_email(${email})`);
    const account = rows[0];
    if (!account || account.email_verified_at) return;

    const token = await withUser(this.db, account.id, async (tx) => {
      const [recent] = await tx
        .select({ id: emailVerificationTokens.id })
        .from(emailVerificationTokens)
        .where(
          and(
            eq(emailVerificationTokens.userId, account.id),
            isNull(emailVerificationTokens.usedAt),
            gt(emailVerificationTokens.createdAt, new Date(Date.now() - RESEND_COOLDOWN_SECONDS * 1000)),
          ),
        );
      return recent ? null : this.createToken(tx, account.id);
    });
    if (token) this.sendLink(email, token);
  }

  // Tandai email terverifikasi. Idempoten: tautan yang sudah dipakai untuk akun yang sudah terverifikasi tetap sukses
  // (tautan dibuka dua kali, atau dibuka dulu oleh pemindai link di email).
  async verify(token: string): Promise<void> {
    const { rows } = await this.db.execute<VerificationLookup>(
      sql`select id, user_id from auth_find_email_verification(${hashToken(token)})`,
    );
    const lookup = rows[0];
    if (!lookup) throw new GoneException("Tautan verifikasi tidak valid atau sudah kedaluwarsa");

    await withUser(this.db, lookup.user_id, async (tx) => {
      const [row] = await tx
        .select({ usedAt: emailVerificationTokens.usedAt, expiresAt: emailVerificationTokens.expiresAt })
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.id, lookup.id))
        .for("update");
      const [user] = await tx.select({ emailVerifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, lookup.user_id));
      if (!row || !user) throw new GoneException("Tautan verifikasi tidak valid atau sudah kedaluwarsa");
      if (row.usedAt && user.emailVerifiedAt) return;
      if (row.usedAt || row.expiresAt.getTime() <= Date.now()) {
        throw new GoneException("Tautan verifikasi tidak valid atau sudah kedaluwarsa");
      }

      const now = new Date();
      await tx.update(emailVerificationTokens).set({ usedAt: now }).where(eq(emailVerificationTokens.id, lookup.id));
      if (!user.emailVerifiedAt) await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, lookup.user_id));
    });
  }
}
