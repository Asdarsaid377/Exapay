import { randomUUID } from "node:crypto";

import { memberships, refreshTokens, tenants, users } from "@exapay/db";
import type { AuthSession, AuthTokens, LoginInput, TenantMembership } from "@exapay/shared";
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import type { AccessTokenPayload, AuthUser } from "../../common/auth/auth-user.js";
import type { Env } from "../../common/config/env.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type Transaction, withUser } from "../../database/tenant-transaction.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
// Refresh token yang dipakai ulang dalam jendela ini dianggap request paralel (mis. proxy Next.js yang
// me-refresh navigasi + prefetch bersamaan), bukan pencurian: tetap dilayani dengan token baru di family yang sama.
// Di luar jendela → seluruh family dicabut.
const REUSE_GRACE_SECONDS = 30;

type RefreshTokenPayload = {
  sub: string;
  jti: string;
  fam: string;
};

type LoginAccount = {
  id: string;
  password_hash: string | null;
  is_super_admin: boolean;
  email_verified_at: Date | null;
};

export type IssuedSession = {
  session: AuthSession;
  tokens: AuthTokens;
};

type LoadedSession = {
  session: AuthSession;
  // Punya membership di tenant yang dinonaktifkan super-admin (tenant tsb tidak masuk session.tenants)
  hasDeactivatedTenant: boolean;
};

export const TENANT_DEACTIVATED_MESSAGE = "Usaha Anda sedang dinonaktifkan. Hubungi tim Exapay untuk informasi lebih lanjut.";

type RotationOutcome = { kind: "issued"; issued: IssuedSession } | { kind: "rejected"; revokeFamily: boolean };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Hash pembanding saat email tidak terdaftar, agar waktu respons tidak membocorkan keberadaan akun
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(input: LoginInput): Promise<IssuedSession> {
    // Belum ada konteks user → satu-satunya jalur baca users adalah fungsi SECURITY DEFINER
    const { rows } = await this.db.execute<LoginAccount>(
      sql`select id, password_hash, is_super_admin, email_verified_at from auth_find_user_by_email(${input.email})`,
    );
    const account = rows[0];

    const passwordValid = account?.password_hash
      ? await verify(account.password_hash, input.password)
      : await this.verifyDummy(input.password);
    if (!account || !passwordValid) {
      throw new UnauthorizedException("Email atau password salah");
    }
    // Dicek SETELAH password benar: status verifikasi tidak bocor ke orang yang tidak tahu password
    if (!account.email_verified_at) {
      throw new ForbiddenException({
        message: "Email Anda belum diverifikasi. Buka tautan verifikasi yang kami kirim ke email Anda.",
        code: "EMAIL_UNVERIFIED",
      });
    }

    return withUser(this.db, account.id, async (tx) => {
      const { session, hasDeactivatedTenant } = await this.loadSession(tx, account.id, null);
      // Semua usaha user dinonaktifkan super-admin → login ditolak (super-admin tetap bisa masuk ke panelnya)
      if (hasDeactivatedTenant && session.tenants.length === 0 && !session.user.isSuperAdmin) {
        throw new ForbiddenException({ message: TENANT_DEACTIVATED_MESSAGE, code: "TENANT_DEACTIVATED" });
      }
      // Otomatis memilih tenant jika user hanya tergabung di satu tenant
      const onlyTenant = session.tenants.length === 1 ? (session.tenants[0] ?? null) : null;
      const activeSession: AuthSession = { ...session, activeTenant: onlyTenant };
      const tokens = await this.issueTokens(tx, activeSession, randomUUID());
      return { session: activeSession, tokens };
    });
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    return this.rotate(refreshToken, { kind: "keep" });
  }

  // Ganti tenant aktif: rotasi refresh token dengan tenant baru. Hanya untuk pemilik token yang sedang login.
  async switchTenant(user: AuthUser, refreshToken: string, tenantId: string): Promise<IssuedSession> {
    return this.rotate(refreshToken, { kind: "switch", tenantId, expectedUserId: user.userId });
  }

  async logout(refreshToken: string): Promise<void> {
    const payload = await this.verifyRefreshToken(refreshToken);
    if (!payload) return; // Token tidak valid/kedaluwarsa: tidak ada yang perlu dicabut
    await withUser(this.db, payload.sub, (tx) => this.revokeFamily(tx, payload.fam));
  }

  async getSession(user: AuthUser): Promise<AuthSession> {
    return withUser(this.db, user.userId, async (tx) => (await this.loadSession(tx, user.userId, user.tenantId)).session);
  }

  // Ganti password dari profil (feature 37): password saat ini wajib benar (400 — bukan 401, sesi tetap sah). Sesi lain
  // diakhiri (refresh token family lain dicabut); sesi yang sedang dipakai tetap. Access token sesi lain masih berlaku
  // ≤ 15 menit (sama dengan reset password & cabut akses).
  async changePassword(user: AuthUser, currentPassword: string, newPassword: string, refreshToken: string | undefined): Promise<void> {
    const [account] = await withUser(this.db, user.userId, (tx) =>
      tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.userId)),
    );
    const valid = account?.passwordHash ? await verify(account.passwordHash, currentPassword) : await this.verifyDummy(currentPassword);
    if (!valid) throw new BadRequestException("Password saat ini salah");

    const payload = refreshToken ? await this.verifyRefreshToken(refreshToken) : null;
    const keepFamily = payload?.sub === user.userId ? payload.fam : null;
    const passwordHash = await this.hashPassword(newPassword);
    await withUser(this.db, user.userId, async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, user.userId));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.userId, user.userId),
            isNull(refreshTokens.revokedAt),
            keepFamily ? ne(refreshTokens.familyId, keepFamily) : undefined,
          ),
        );
    });
  }

  async hashPassword(password: string): Promise<string> {
    // Default @node-rs/argon2: argon2id (m=19456 KiB, t=2, p=1 — rekomendasi OWASP)
    return hash(password);
  }

  private async rotate(
    refreshToken: string,
    target: { kind: "keep" } | { kind: "switch"; tenantId: string; expectedUserId: string },
  ): Promise<IssuedSession> {
    const payload = await this.verifyRefreshToken(refreshToken);
    if (!payload || (target.kind === "switch" && payload.sub !== target.expectedUserId)) {
      throw new UnauthorizedException("Sesi berakhir, silakan login kembali");
    }

    const outcome = await withUser(this.db, payload.sub, async (tx): Promise<RotationOutcome> => {
      const [row] = await tx
        .select({
          rotatedAt: refreshTokens.rotatedAt,
          revokedAt: refreshTokens.revokedAt,
          expiresAt: refreshTokens.expiresAt,
          activeTenantId: refreshTokens.activeTenantId,
        })
        .from(refreshTokens)
        .where(and(eq(refreshTokens.id, payload.jti), eq(refreshTokens.familyId, payload.fam)))
        .for("update");

      // Dicabut (logout/reset/pencurian) atau kedaluwarsa: tidak pernah berlaku lagi
      if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) return { kind: "rejected", revokeFamily: false };
      if (row.rotatedAt) {
        const reusedAfterSeconds = (Date.now() - row.rotatedAt.getTime()) / 1000;
        if (reusedAfterSeconds > REUSE_GRACE_SECONDS) return { kind: "rejected", revokeFamily: true };
        // Dalam jendela toleransi (request paralel): layani lagi tanpa mengubah rotatedAt
      } else {
        await tx.update(refreshTokens).set({ rotatedAt: new Date() }).where(eq(refreshTokens.id, payload.jti));
      }

      const requestedTenantId = target.kind === "switch" ? target.tenantId : row.activeTenantId;
      const { session, hasDeactivatedTenant } = await this.loadSession(tx, payload.sub, requestedTenantId);
      // Usaha dinonaktifkan sejak login: sesi berakhir (login berikutnya menampilkan alasannya)
      if (hasDeactivatedTenant && session.tenants.length === 0 && !session.user.isSuperAdmin) {
        return { kind: "rejected", revokeFamily: false };
      }
      if (target.kind === "switch" && !session.activeTenant) {
        throw new ForbiddenException("Anda bukan anggota usaha tersebut");
      }

      const tokens = await this.issueTokens(tx, session, payload.fam);
      return { kind: "issued", issued: { session, tokens } };
    });

    if (outcome.kind === "issued") return outcome.issued;

    if (outcome.revokeFamily) {
      // Token lama dipakai ulang → kemungkinan dicuri. Cabut semua token turunan (transaksi terpisah agar tetap commit).
      this.logger.warn(`[auth/refresh] refresh token dipakai ulang, family ${payload.fam} dicabut`);
      await withUser(this.db, payload.sub, (tx) => this.revokeFamily(tx, payload.fam));
    }
    throw new UnauthorizedException("Sesi berakhir, silakan login kembali");
  }

  // Profil + semua membership user di tenant yang AKTIF. activeTenant = membership yang cocok dengan tenantId (jika masih anggota).
  private async loadSession(tx: Transaction, userId: string, tenantId: string | null): Promise<LoadedSession> {
    const [user] = await tx
      .select({ id: users.id, email: users.email, fullName: users.fullName, isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedException("Akun tidak ditemukan");

    const rows = await tx
      .select({ tenantId: memberships.tenantId, tenantName: tenants.name, role: memberships.role, deactivatedAt: tenants.deactivatedAt })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(tenants.name));
    const tenantList: TenantMembership[] = rows
      .filter((row) => !row.deactivatedAt)
      .map(({ tenantId: id, tenantName, role }) => ({ tenantId: id, tenantName, role }));

    const activeTenant = tenantId ? (tenantList.find((t) => t.tenantId === tenantId) ?? null) : null;
    return { session: { user, activeTenant, tenants: tenantList }, hasDeactivatedTenant: rows.some((row) => row.deactivatedAt) };
  }

  private async issueTokens(tx: Transaction, session: AuthSession, familyId: string): Promise<AuthTokens> {
    const refreshId = randomUUID();
    await tx.insert(refreshTokens).values({
      id: refreshId,
      userId: session.user.id,
      familyId,
      activeTenantId: session.activeTenant?.tenantId ?? null,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    });

    const accessPayload: AccessTokenPayload = {
      sub: session.user.id,
      tid: session.activeTenant?.tenantId ?? null,
      role: session.activeTenant?.role ?? null,
      sa: session.user.isSuperAdmin,
    };
    const refreshPayload: RefreshTokenPayload = { sub: session.user.id, jti: refreshId, fam: familyId };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        algorithm: "HS256",
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
        algorithm: "HS256",
        expiresIn: REFRESH_TOKEN_TTL_SECONDS,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
        algorithms: ["HS256"],
      });
      const { sub, jti, fam } = payload;
      if (typeof sub !== "string" || typeof jti !== "string" || typeof fam !== "string") return null;
      return { sub, jti, fam };
    } catch {
      return null;
    }
  }

  private async revokeFamily(tx: Transaction, familyId: string): Promise<void> {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  private async verifyDummy(password: string): Promise<false> {
    this.dummyHash ??= hash(randomUUID());
    await verify(await this.dummyHash, password);
    return false;
  }
}
