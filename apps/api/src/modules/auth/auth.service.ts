import { randomUUID } from "node:crypto";

import { memberships, refreshTokens, tenants, users } from "@exapay/db";
import type { AuthSession, AuthTokens, LoginInput, TenantMembership } from "@exapay/shared";
import { ForbiddenException, Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { hash, verify } from "@node-rs/argon2";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { AccessTokenPayload, AuthUser } from "../../common/auth/auth-user.js";
import type { Env } from "../../common/config/env.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type Transaction, withUser } from "../../database/tenant-transaction.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
// Refresh token yang dipakai ulang dalam jendela ini dianggap request paralel (mis. dua tab), bukan pencurian:
// ditolak tanpa mencabut seluruh family.
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
};

export type IssuedSession = {
  session: AuthSession;
  tokens: AuthTokens;
};

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
      sql`select id, password_hash, is_super_admin from auth_find_user_by_email(${input.email})`,
    );
    const account = rows[0];

    const passwordValid = account?.password_hash
      ? await verify(account.password_hash, input.password)
      : await this.verifyDummy(input.password);
    if (!account || !passwordValid) {
      throw new UnauthorizedException("Email atau password salah");
    }

    return withUser(this.db, account.id, async (tx) => {
      const session = await this.loadSession(tx, account.id, null);
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
    return withUser(this.db, user.userId, (tx) => this.loadSession(tx, user.userId, user.tenantId));
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
        .select({ revokedAt: refreshTokens.revokedAt, expiresAt: refreshTokens.expiresAt, activeTenantId: refreshTokens.activeTenantId })
        .from(refreshTokens)
        .where(and(eq(refreshTokens.id, payload.jti), eq(refreshTokens.familyId, payload.fam)))
        .for("update");

      if (!row) return { kind: "rejected", revokeFamily: false };
      if (row.revokedAt) {
        const reusedAfterSeconds = (Date.now() - row.revokedAt.getTime()) / 1000;
        return { kind: "rejected", revokeFamily: reusedAfterSeconds > REUSE_GRACE_SECONDS };
      }
      if (row.expiresAt.getTime() <= Date.now()) return { kind: "rejected", revokeFamily: false };

      await tx.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, payload.jti));

      const requestedTenantId = target.kind === "switch" ? target.tenantId : row.activeTenantId;
      const session = await this.loadSession(tx, payload.sub, requestedTenantId);
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

  // Profil + semua membership user. activeTenant = membership yang cocok dengan tenantId (jika masih anggota).
  private async loadSession(tx: Transaction, userId: string, tenantId: string | null): Promise<AuthSession> {
    const [user] = await tx
      .select({ id: users.id, email: users.email, fullName: users.fullName, isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new UnauthorizedException("Akun tidak ditemukan");

    const tenantList: TenantMembership[] = await tx
      .select({ tenantId: memberships.tenantId, tenantName: tenants.name, role: memberships.role })
      .from(memberships)
      .innerJoin(tenants, eq(tenants.id, memberships.tenantId))
      .where(eq(memberships.userId, userId))
      .orderBy(asc(tenants.name));

    const activeTenant = tenantId ? (tenantList.find((t) => t.tenantId === tenantId) ?? null) : null;
    return { user, activeTenant, tenants: tenantList };
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
