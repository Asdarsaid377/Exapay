import { createHash, randomBytes, randomUUID } from "node:crypto";

import { invitations, memberships, tenants, users } from "@exapay/db";
import type { AcceptInvitationInput, InvitationPreview, MembershipRole } from "@exapay/shared";
import { BadRequestException, ConflictException, GoneException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Env } from "../../common/config/env.js";
import { DRIZZLE } from "../../database/database.module.js";
import { isUniqueViolation } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { AuthService } from "../auth/auth.service.js";
import { EmailService } from "../email/email.service.js";

export const INVITATION_TTL_DAYS = 7;

const INVALID_LINK = "Tautan undangan tidak valid atau sudah dipakai";

type InvitationLookup = { id: string; tenant_id: string };
type AccountLookup = { id: string; password_hash: string | null };

type NewInvitation = {
  email: string;
  fullName: string;
  role: MembershipRole;
};

type LoadedInvitation = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantDeactivated: boolean;
  email: string;
  fullName: string;
  role: MembershipRole;
  expiresAt: Date;
  acceptedAt: Date | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const ROLE_TEXT: Record<MembershipRole, string> = {
  owner: "pemilik",
  admin: "admin",
  atasan: "atasan",
  karyawan: "karyawan",
};

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // Buat undangan di transaksi pemanggil (konteks tenant tujuan). Undangan lama yang belum diterima untuk email
  // yang sama di tenant ini dihapus — hanya tautan terbaru yang berlaku. Mengembalikan id + token asli (token hanya untuk email).
  async create(tx: Transaction, ctx: TenantContext, input: NewInvitation): Promise<{ id: string; token: string }> {
    const token = randomBytes(32).toString("base64url");
    await tx
      .delete(invitations)
      .where(and(eq(invitations.tenantId, ctx.tenantId), sql`lower(${invitations.email}) = lower(${input.email})`, isNull(invitations.acceptedAt)));
    const [row] = await tx
      .insert(invitations)
      .values({
      tenantId: ctx.tenantId,
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      tokenHash: hashToken(token),
      invitedByUserId: ctx.userId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      })
      .returning({ id: invitations.id });
    if (!row) throw new Error("[invitations/create] insert tidak mengembalikan baris");
    return { id: row.id, token };
  }

  // Dikirim di latar agar respons tidak menunggu SMTP.
  // TODO(feature antrean): pindahkan ke BullMQ agar tahan restart & bisa retry.
  sendEmail(message: { to: string; fullName: string; tenantName: string; role: MembershipRole; token: string }): void {
    const link = `${this.config.get("APP_WEB_URL", { infer: true })}/invite/${message.token}`;
    void this.email
      .send({
        to: message.to,
        subject: `Undangan bergabung dengan ${message.tenantName} di Exapay`,
        text: [
          `Halo ${message.fullName},`,
          "",
          `Anda diundang bergabung dengan ${message.tenantName} di Exapay sebagai ${ROLE_TEXT[message.role]}.`,
          `Buka tautan berikut untuk menerima undangan (berlaku ${INVITATION_TTL_DAYS} hari):`,
          "",
          link,
          "",
          "Jika Anda tidak mengenal usaha ini, abaikan email ini.",
        ].join("\n"),
      })
      .catch((error: unknown) => {
        this.logger.error(`[invitations/send] email undangan gagal: ${error instanceof Error ? error.message : String(error)}`);
      });
  }

  // Isi undangan untuk halaman /invite/[token]. 410 jika tidak ada / sudah diterima / usaha dinonaktifkan.
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await this.load(token);
    if (!invitation || invitation.acceptedAt || invitation.tenantDeactivated) throw new GoneException(INVALID_LINK);

    const account = await this.findAccount(invitation.email);
    return {
      tenantName: invitation.tenantName,
      email: invitation.email,
      fullName: invitation.fullName,
      role: invitation.role,
      accountExists: Boolean(account?.password_hash),
      expiresAt: invitation.expiresAt.toISOString(),
      expired: invitation.expiresAt.getTime() <= Date.now(),
    };
  }

  // Terima undangan: akun baru dibuat (email dianggap terverifikasi — token membuktikan kepemilikan email),
  // atau usaha ditambahkan ke akun yang sudah ada. Sesi TIDAK dibuat: user masuk lewat /login.
  async accept(input: AcceptInvitationInput): Promise<void> {
    const invitation = await this.load(input.token);
    if (!invitation || invitation.acceptedAt || invitation.tenantDeactivated) throw new GoneException(INVALID_LINK);
    if (invitation.expiresAt.getTime() <= Date.now()) throw new GoneException("Undangan sudah kedaluwarsa. Minta pengirim undangan untuk mengirim ulang.");

    const account = await this.findAccount(invitation.email);
    const needsPassword = !account?.password_hash;
    if (needsPassword && (!input.password || (!account && !input.fullName))) {
      throw new BadRequestException("Nama lengkap dan password wajib diisi");
    }
    const passwordHash = needsPassword && input.password ? await this.authService.hashPassword(input.password) : null;

    const userId = account?.id ?? randomUUID();
    const ctx: TenantContext = { tenantId: invitation.tenantId, userId };
    try {
      await withTenant(this.db, ctx, async (tx) => {
        // Kunci baris: dua klik bersamaan tidak menerima undangan yang sama dua kali
        const [row] = await tx
          .select({ acceptedAt: invitations.acceptedAt })
          .from(invitations)
          .where(eq(invitations.id, invitation.id))
          .for("update");
        if (!row || row.acceptedAt) throw new GoneException(INVALID_LINK);

        const now = new Date();
        if (!account) {
          await tx.insert(users).values({
            id: userId,
            email: invitation.email,
            fullName: input.fullName ?? invitation.fullName,
            passwordHash,
            emailVerifiedAt: now,
          });
        } else {
          // Akun lama: tandai terverifikasi (mis. signup yang belum diverifikasi); set password hanya jika belum punya
          await tx
            .update(users)
            .set({ emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now})`, ...(passwordHash ? { passwordHash } : {}) })
            .where(eq(users.id, userId));
        }
        // Sudah anggota (mis. diundang dua kali): peran lama dipertahankan
        await tx.insert(memberships).values({ tenantId: invitation.tenantId, userId, role: invitation.role }).onConflictDoNothing();
        await tx.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id));
        await this.audit.record(tx, ctx, {
          entity: "invitation",
          entityId: invitation.id,
          action: "accept",
          after: { userId, role: invitation.role, newAccount: !account },
        });
      });
    } catch (error: unknown) {
      // Akun dengan email yang sama dibuat bersamaan (mis. signup paralel)
      if (isUniqueViolation(error)) throw new ConflictException("Email ini baru saja didaftarkan. Muat ulang halaman lalu coba lagi.");
      throw error;
    }
  }

  // Cari undangan dari token tanpa konteks (fungsi SECURITY DEFINER), lalu baca isinya dengan konteks tenantnya
  private async load(token: string): Promise<LoadedInvitation | null> {
    const { rows } = await this.db.execute<InvitationLookup>(sql`select id, tenant_id from auth_find_invitation(${hashToken(token)})`);
    const lookup = rows[0];
    if (!lookup) return null;

    const [row] = await withTenant(this.db, { tenantId: lookup.tenant_id, userId: null }, (tx) =>
      tx
        .select({
          id: invitations.id,
          tenantId: invitations.tenantId,
          tenantName: tenants.name,
          tenantDeactivatedAt: tenants.deactivatedAt,
          email: invitations.email,
          fullName: invitations.fullName,
          role: invitations.role,
          expiresAt: invitations.expiresAt,
          acceptedAt: invitations.acceptedAt,
        })
        .from(invitations)
        .innerJoin(tenants, eq(tenants.id, invitations.tenantId))
        .where(eq(invitations.id, lookup.id)),
    );
    if (!row) return null;
    const { tenantDeactivatedAt, ...rest } = row;
    return { ...rest, tenantDeactivated: tenantDeactivatedAt !== null };
  }

  private async findAccount(email: string): Promise<AccountLookup | null> {
    const { rows } = await this.db.execute<AccountLookup>(sql`select id, password_hash from auth_find_user_by_email(${email})`);
    return rows[0] ?? null;
  }
}
