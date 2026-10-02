import { randomUUID } from "node:crypto";

import { invitations, memberships, tenants } from "@exapay/db";
import {
  ADMIN_TENANTS_PAGE_SIZE,
  type AdminTenantDetail,
  type AdminTenantList,
  type AdminTenantListItem,
  type AdminTenantListQuery,
  type AdminTenantOwner,
  type CreatedTenant,
  type CreateTenantInput,
  type TenantStatus,
} from "@exapay/shared";
import { ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

import type { AuthUser } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { type Database, type TenantContext, type Transaction, withTenant, withUser } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { SubscriptionsService } from "../billing/subscriptions.service.js";
import { InvitationsService } from "../invitations/invitations.service.js";
import { seedTenantDefaults } from "./tenant-defaults.js";

// Kirim ulang undangan pemilik paling cepat sekali per jendela ini (anti-spam ke inbox pemilik)
const RESEND_COOLDOWN_SECONDS = 60;

// Baris fungsi admin_tenant_overview() — batas data yang boleh dilihat super-admin (lihat migration 0005).
// db.execute() (SQL mentah) mengembalikan timestamptz sebagai string, bukan Date.
type OverviewRow = {
  id: string;
  name: string;
  created_at: string;
  deactivated_at: string | null;
  owner_full_name: string | null;
  owner_email: string | null;
  owner_email_verified: boolean | null;
  invite_full_name: string | null;
  invite_email: string | null;
  invite_created_at: string | null;
  invite_expires_at: string | null;
  owner_count: number;
  admin_count: number;
  atasan_count: number;
  karyawan_count: number;
  pending_invitations: number;
};

const OVERVIEW_COLUMNS = sql.raw(
  [
    "id, name, created_at, deactivated_at",
    "owner_full_name, owner_email, owner_email_verified",
    "invite_full_name, invite_email, invite_created_at, invite_expires_at",
    "owner_count, admin_count, atasan_count, karyawan_count, pending_invitations",
  ].join(", "),
);

function isoOf(value: string): string {
  return new Date(value).toISOString();
}

function statusOf(row: OverviewRow): TenantStatus {
  if (row.deactivated_at) return "deactivated";
  return row.owner_count > 0 ? "active" : "pending_owner";
}

function ownerOf(row: OverviewRow): AdminTenantOwner | null {
  if (row.owner_email && row.owner_full_name) {
    return {
      fullName: row.owner_full_name,
      email: row.owner_email,
      state: row.owner_email_verified ? "active" : "unverified",
      invitedAt: null,
      invitationExpiresAt: null,
    };
  }
  if (row.invite_email && row.invite_full_name && row.invite_created_at && row.invite_expires_at) {
    return {
      fullName: row.invite_full_name,
      email: row.invite_email,
      state: new Date(row.invite_expires_at).getTime() <= Date.now() ? "invitation_expired" : "invited",
      invitedAt: isoOf(row.invite_created_at),
      invitationExpiresAt: isoOf(row.invite_expires_at),
    };
  }
  return null;
}

function toListItem(row: OverviewRow): AdminTenantListItem {
  return {
    id: row.id,
    name: row.name,
    status: statusOf(row),
    createdAt: isoOf(row.created_at),
    owner: ownerOf(row),
    memberCount: row.owner_count + row.admin_count + row.atasan_count + row.karyawan_count,
  };
}

@Injectable()
export class TenantsAdminService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly invitationsService: InvitationsService,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  // Filter & paginasi di aplikasi: jumlah tenant platform masih kecil (MVP). Pindahkan ke SQL jika sudah ribuan.
  async list(user: AuthUser, query: AdminTenantListQuery): Promise<AdminTenantList> {
    const rows = await this.overview(user);
    const all = rows.map(toListItem).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const q = query.q.toLowerCase();
    const filtered = all.filter(
      (t) =>
        (query.status === "all" || t.status === query.status) &&
        (!q || t.name.toLowerCase().includes(q) || (t.owner?.email.toLowerCase().includes(q) ?? false)),
    );
    const start = (query.page - 1) * ADMIN_TENANTS_PAGE_SIZE;
    return {
      items: filtered.slice(start, start + ADMIN_TENANTS_PAGE_SIZE),
      total: filtered.length,
      page: query.page,
      pageSize: ADMIN_TENANTS_PAGE_SIZE,
      counts: {
        all: all.length,
        active: all.filter((t) => t.status === "active").length,
        pending_owner: all.filter((t) => t.status === "pending_owner").length,
        deactivated: all.filter((t) => t.status === "deactivated").length,
      },
    };
  }

  async detail(user: AuthUser, tenantId: string): Promise<AdminTenantDetail> {
    const row = (await this.overview(user, tenantId))[0];
    if (!row) throw new NotFoundException("Tenant tidak ditemukan");
    return {
      id: row.id,
      name: row.name,
      status: statusOf(row),
      createdAt: isoOf(row.created_at),
      deactivatedAt: row.deactivated_at ? isoOf(row.deactivated_at) : null,
      owner: ownerOf(row),
      memberCounts: { owner: row.owner_count, admin: row.admin_count, atasan: row.atasan_count, karyawan: row.karyawan_count },
      pendingInvitations: row.pending_invitations,
    };
  }

  // Tenant baru + data bawaan + undangan pemilik dalam satu transaksi; email dikirim setelah commit
  async create(user: AuthUser, input: CreateTenantInput): Promise<CreatedTenant> {
    const ctx: TenantContext = { tenantId: randomUUID(), userId: user.userId };
    const token = await withTenant(this.db, ctx, async (tx) => {
      await this.assertSuperAdmin(tx);
      await tx.insert(tenants).values({ id: ctx.tenantId, name: input.name });
      await seedTenantDefaults(tx, ctx);
      await this.subscriptions.start(tx, ctx, input.subscription);
      await this.audit.record(tx, ctx, {
        entity: "tenant",
        entityId: ctx.tenantId,
        action: "create_by_super_admin",
        after: { name: input.name, ownerEmail: input.ownerEmail, subscription: input.subscription },
      });
      const { token } = await this.invitationsService.create(tx, ctx, { email: input.ownerEmail, fullName: input.ownerFullName, role: "owner" });
      return token;
    });
    this.invitationsService.sendEmail({ to: input.ownerEmail, fullName: input.ownerFullName, tenantName: input.name, role: "owner", token });
    return { id: ctx.tenantId };
  }

  async setDeactivated(user: AuthUser, tenantId: string, deactivated: boolean): Promise<void> {
    const ctx: TenantContext = { tenantId, userId: user.userId };
    await withTenant(this.db, ctx, async (tx) => {
      await this.assertSuperAdmin(tx);
      const [tenant] = await tx.select({ deactivatedAt: tenants.deactivatedAt }).from(tenants).where(eq(tenants.id, tenantId)).for("update");
      if (!tenant) throw new NotFoundException("Tenant tidak ditemukan");
      // Idempoten: sudah dalam status yang diminta
      if ((tenant.deactivatedAt !== null) === deactivated) return;

      const deactivatedAt = deactivated ? new Date() : null;
      await tx.update(tenants).set({ deactivatedAt }).where(eq(tenants.id, tenantId));
      await this.audit.record(tx, ctx, {
        entity: "tenant",
        entityId: tenantId,
        action: deactivated ? "deactivate" : "reactivate",
        before: { deactivatedAt: tenant.deactivatedAt },
        after: { deactivatedAt },
      });
    });
  }

  // Undangan pemilik baru untuk tenant yang pemiliknya belum bergabung (tautan lama tidak berlaku lagi)
  async resendOwnerInvitation(user: AuthUser, tenantId: string): Promise<void> {
    const ctx: TenantContext = { tenantId, userId: user.userId };
    const sent = await withTenant(this.db, ctx, async (tx) => {
      await this.assertSuperAdmin(tx);
      const [tenant] = await tx.select({ name: tenants.name, deactivatedAt: tenants.deactivatedAt }).from(tenants).where(eq(tenants.id, tenantId));
      if (!tenant) throw new NotFoundException("Tenant tidak ditemukan");
      if (tenant.deactivatedAt) throw new ConflictException("Aktifkan kembali tenant sebelum mengirim undangan");

      const [owner] = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenantId), eq(memberships.role, "owner")));
      if (owner) throw new ConflictException("Pemilik sudah bergabung dengan tenant ini");

      const [invitation] = await tx
        .select({ email: invitations.email, fullName: invitations.fullName, createdAt: invitations.createdAt })
        .from(invitations)
        .where(and(eq(invitations.tenantId, tenantId), eq(invitations.role, "owner"), isNull(invitations.acceptedAt)))
        .orderBy(desc(invitations.createdAt))
        .limit(1);
      if (!invitation) throw new ConflictException("Tenant ini tidak punya undangan pemilik");
      if (invitation.createdAt.getTime() > Date.now() - RESEND_COOLDOWN_SECONDS * 1000) {
        throw new HttpException("Undangan baru saja dikirim. Tunggu sebentar sebelum mengirim ulang.", HttpStatus.TOO_MANY_REQUESTS);
      }

      const { token } = await this.invitationsService.create(tx, ctx, { email: invitation.email, fullName: invitation.fullName, role: "owner" });
      await this.audit.record(tx, ctx, { entity: "invitation", entityId: tenantId, action: "resend_owner", after: { email: invitation.email } });
      return { token, email: invitation.email, fullName: invitation.fullName, tenantName: tenant.name };
    });
    this.invitationsService.sendEmail({ to: sent.email, fullName: sent.fullName, tenantName: sent.tenantName, role: "owner", token: sent.token });
  }

  private async overview(user: AuthUser, tenantId?: string): Promise<OverviewRow[]> {
    return withUser(this.db, user.userId, async (tx) => {
      await this.assertSuperAdmin(tx);
      const { rows } = await tx.execute<OverviewRow>(
        tenantId
          ? sql`select ${OVERVIEW_COLUMNS} from admin_tenant_overview() where id = ${tenantId}`
          : sql`select ${OVERVIEW_COLUMNS} from admin_tenant_overview()`,
      );
      return rows;
    });
  }

  // Klaim `sa` di token bisa basi hingga 15 menit — flag yang berlaku dibaca dari database
  private async assertSuperAdmin(tx: Transaction): Promise<void> {
    const { rows } = await tx.execute<{ ok: boolean }>(sql`select public.current_app_is_super_admin() as ok`);
    if (!rows[0]?.ok) throw new ForbiddenException("Anda tidak memiliki akses ke fitur ini");
  }
}
