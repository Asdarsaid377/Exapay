import { invitations, memberships, tenants, users } from "@exapay/db";
import {
  canManageRole,
  type InviteUserInput,
  MANAGEABLE_ROLES,
  type MembershipRole,
  type TenantMember,
  type TenantPendingInvitation,
  type TenantUsersOverview,
} from "@exapay/shared";
import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { InvitationsService } from "../invitations/invitations.service.js";

// Undangan ke email yang sama paling cepat sekali per jendela ini (anti-spam ke inbox penerima)
const RESEND_COOLDOWN_SECONDS = 60;

const NO_ACCESS = "Anda tidak memiliki akses ke fitur ini";
const MEMBER_NOT_FOUND = "Pengguna tidak ditemukan";
const INVITATION_NOT_FOUND = "Undangan tidak ditemukan atau sudah diterima";

type SentInvitation = { token: string; email: string; fullName: string; role: MembershipRole; tenantName: string };

const inviter = alias(users, "inviter");

// Pengguna & undangan satu tenant (feature 08). Peran pengelola dibaca ulang dari database di setiap transaksi:
// peran di access token bisa basi hingga 15 menit (mis. admin yang baru diturunkan perannya).
@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly invitationsService: InvitationsService,
    private readonly audit: AuditService,
  ) {}

  async overview(user: AuthUser): Promise<TenantUsersOverview> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const actorRole = await this.actorRole(tx, ctx);

      const memberRows = await tx
        .select({
          membershipId: memberships.id,
          userId: memberships.userId,
          role: memberships.role,
          joinedAt: memberships.createdAt,
          fullName: users.fullName,
          email: users.email,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.tenantId, ctx.tenantId))
        .orderBy(asc(users.fullName));

      // Pengundang di luar tenant (super-admin) tidak terlihat oleh RLS users → nama null
      const invitationRows = await tx
        .select({
          id: invitations.id,
          fullName: invitations.fullName,
          email: invitations.email,
          role: invitations.role,
          invitedAt: invitations.createdAt,
          expiresAt: invitations.expiresAt,
          invitedByName: inviter.fullName,
        })
        .from(invitations)
        .leftJoin(inviter, eq(inviter.id, invitations.invitedByUserId))
        .where(and(eq(invitations.tenantId, ctx.tenantId), isNull(invitations.acceptedAt)))
        .orderBy(desc(invitations.createdAt));

      const now = Date.now();
      const members: TenantMember[] = memberRows.map((row) => {
        const isSelf = row.userId === ctx.userId;
        return {
          membershipId: row.membershipId,
          fullName: row.fullName,
          email: row.email,
          role: row.role,
          joinedAt: row.joinedAt.toISOString(),
          isSelf,
          canManage: !isSelf && canManageRole(actorRole, row.role),
        };
      });
      const pending: TenantPendingInvitation[] = invitationRows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        email: row.email,
        role: row.role,
        invitedAt: row.invitedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        expired: row.expiresAt.getTime() <= now,
        invitedByName: row.invitedByName,
        canManage: canManageRole(actorRole, row.role),
      }));
      return { members, invitations: pending, assignableRoles: [...MANAGEABLE_ROLES[actorRole]] };
    });
  }

  // Undangan baru (atau pengganti undangan tertunda untuk email yang sama). Email dikirim setelah commit.
  async invite(user: AuthUser, input: InviteUserInput): Promise<void> {
    const ctx = tenantContextOf(user);
    const sent = await withTenant(this.db, ctx, async (tx): Promise<SentInvitation> => {
      const actorRole = await this.actorRole(tx, ctx);
      if (!canManageRole(actorRole, input.role)) throw new ForbiddenException("Anda tidak bisa mengundang pengguna dengan peran ini");

      const [member] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.tenantId, ctx.tenantId), sql`lower(${users.email}) = lower(${input.email})`));
      if (member) throw new ConflictException("Email ini sudah terdaftar sebagai pengguna usaha ini");

      const [existing] = await tx
        .select({ role: invitations.role, createdAt: invitations.createdAt })
        .from(invitations)
        .where(and(eq(invitations.tenantId, ctx.tenantId), sql`lower(${invitations.email}) = lower(${input.email})`, isNull(invitations.acceptedAt)))
        .orderBy(desc(invitations.createdAt))
        .limit(1);
      if (existing) {
        // Admin tidak boleh menimpa undangan pemilik/admin yang dibuat pemilik
        if (!canManageRole(actorRole, existing.role)) throw new ForbiddenException("Email ini sudah punya undangan yang tidak bisa Anda ubah");
        this.assertCooldown(existing.createdAt);
      }

      const { id, token } = await this.invitationsService.create(tx, ctx, input);
      await this.audit.record(tx, ctx, {
        entity: "invitation",
        entityId: id,
        action: existing ? "replace" : "create",
        before: existing ? { role: existing.role } : undefined,
        after: { email: input.email, fullName: input.fullName, role: input.role },
      });
      return { token, email: input.email, fullName: input.fullName, role: input.role, tenantName: await this.tenantName(tx, ctx) };
    });
    this.send(sent);
  }

  // Kirim ulang = undangan baru dengan data yang sama; tautan lama tidak berlaku lagi
  async resendInvitation(user: AuthUser, invitationId: string): Promise<void> {
    const ctx = tenantContextOf(user);
    const sent = await withTenant(this.db, ctx, async (tx): Promise<SentInvitation> => {
      const actorRole = await this.actorRole(tx, ctx);
      const invitation = await this.pendingInvitation(tx, ctx, invitationId, actorRole);
      this.assertCooldown(invitation.createdAt);

      const { email, fullName, role } = invitation;
      const { id, token } = await this.invitationsService.create(tx, ctx, { email, fullName, role });
      await this.audit.record(tx, ctx, { entity: "invitation", entityId: id, action: "resend", before: { invitationId }, after: { email } });
      return { token, email, fullName, role, tenantName: await this.tenantName(tx, ctx) };
    });
    this.send(sent);
  }

  async cancelInvitation(user: AuthUser, invitationId: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const actorRole = await this.actorRole(tx, ctx);
      const invitation = await this.pendingInvitation(tx, ctx, invitationId, actorRole);
      await tx.delete(invitations).where(eq(invitations.id, invitationId));
      await this.audit.record(tx, ctx, {
        entity: "invitation",
        entityId: invitationId,
        action: "cancel",
        before: { email: invitation.email, role: invitation.role },
      });
    });
  }

  async changeRole(user: AuthUser, membershipId: string, role: MembershipRole): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const actorRole = await this.actorRole(tx, ctx);
      const target = await this.manageableMember(tx, ctx, membershipId, actorRole);
      if (!canManageRole(actorRole, role)) throw new ForbiddenException("Anda tidak bisa memberikan peran ini");
      if (target.role === role) return;

      await tx.update(memberships).set({ role }).where(eq(memberships.id, membershipId));
      if (target.role === "owner") await this.assertOwnerRemains(tx, ctx);
      await this.audit.record(tx, ctx, {
        entity: "membership",
        entityId: membershipId,
        action: "change_role",
        before: { userId: target.userId, role: target.role },
        after: { userId: target.userId, role },
      });
    });
  }

  // Cabut akses = hapus membership. Akun user tetap ada (bisa di usaha lain / diundang lagi).
  // Sesi yang sedang terbuka kehilangan usaha ini saat refresh berikutnya (access token ≤ 15 menit).
  async revoke(user: AuthUser, membershipId: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      const actorRole = await this.actorRole(tx, ctx);
      const target = await this.manageableMember(tx, ctx, membershipId, actorRole);

      await tx.delete(memberships).where(eq(memberships.id, membershipId));
      if (target.role === "owner") await this.assertOwnerRemains(tx, ctx);
      await this.audit.record(tx, ctx, {
        entity: "membership",
        entityId: membershipId,
        action: "revoke",
        before: { userId: target.userId, role: target.role },
      });
    });
  }

  private async actorRole(tx: Transaction, ctx: TenantContext): Promise<MembershipRole> {
    if (!ctx.userId) throw new ForbiddenException(NO_ACCESS);
    // Filter tenant wajib: policy own_memberships_select juga memperlihatkan membership user di usaha lain
    const [row] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, ctx.userId)));
    if (!row || MANAGEABLE_ROLES[row.role].length === 0) throw new ForbiddenException(NO_ACCESS);
    return row.role;
  }

  // Baris dikunci: dua pengelola yang mengubah anggota yang sama tidak saling menimpa diam-diam
  private async manageableMember(
    tx: Transaction,
    ctx: TenantContext,
    membershipId: string,
    actorRole: MembershipRole,
  ): Promise<{ userId: string; role: MembershipRole }> {
    const [target] = await tx
      .select({ userId: memberships.userId, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.id, membershipId)))
      .for("update");
    if (!target) throw new NotFoundException(MEMBER_NOT_FOUND);
    if (target.userId === ctx.userId) throw new ForbiddenException("Anda tidak bisa mengubah peran atau mencabut akses Anda sendiri");
    if (!canManageRole(actorRole, target.role)) throw new ForbiddenException("Anda tidak bisa mengelola pengguna dengan peran ini");
    return target;
  }

  private async pendingInvitation(
    tx: Transaction,
    ctx: TenantContext,
    invitationId: string,
    actorRole: MembershipRole,
  ): Promise<{ email: string; fullName: string; role: MembershipRole; createdAt: Date }> {
    const [invitation] = await tx
      .select({ email: invitations.email, fullName: invitations.fullName, role: invitations.role, createdAt: invitations.createdAt })
      .from(invitations)
      .where(and(eq(invitations.tenantId, ctx.tenantId), eq(invitations.id, invitationId), isNull(invitations.acceptedAt)))
      .for("update");
    if (!invitation) throw new NotFoundException(INVITATION_NOT_FOUND);
    if (!canManageRole(actorRole, invitation.role)) throw new ForbiddenException("Anda tidak bisa mengelola undangan dengan peran ini");
    return invitation;
  }

  // Dicek setelah perubahan, di transaksi yang sama → rollback jika usaha kehilangan pemilik terakhir
  private async assertOwnerRemains(tx: Transaction, ctx: TenantContext): Promise<void> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::integer` })
      .from(memberships)
      .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.role, "owner")));
    if (!row || row.count === 0) throw new ConflictException("Usaha harus memiliki minimal satu pemilik");
  }

  private assertCooldown(lastSentAt: Date): void {
    if (lastSentAt.getTime() > Date.now() - RESEND_COOLDOWN_SECONDS * 1000) {
      throw new HttpException("Undangan ke email ini baru saja dikirim. Tunggu sebentar sebelum mengirim ulang.", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async tenantName(tx: Transaction, ctx: TenantContext): Promise<string> {
    const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, ctx.tenantId));
    if (!tenant) throw new NotFoundException("Usaha tidak ditemukan");
    return tenant.name;
  }

  private send(sent: SentInvitation): void {
    this.invitationsService.sendEmail({ to: sent.email, fullName: sent.fullName, tenantName: sent.tenantName, role: sent.role, token: sent.token });
  }
}
