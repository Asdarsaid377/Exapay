import { MEMBERSHIP_ROLES } from "@exapay/shared";
import { ChevronLeft, CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ResendOwnerInvitationButton } from "@/components/admin/ResendOwnerInvitationButton";
import { TenantStatusActions } from "@/components/admin/TenantStatusActions";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAdminTenant } from "@/lib/api/adminTenants";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/roleLabels";
import { OWNER_STATE_LABELS, TENANT_STATUS_LABELS, TENANT_STATUS_TONES } from "@/lib/tenantStatus";

export const metadata: Metadata = { title: "Detail tenant — Panel Super-admin Exapay" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CARD = "glass-strong flex flex-col gap-4 rounded-card px-5 py-5 lg:px-6 lg:py-5.5";
const ROW = "flex items-baseline justify-between gap-4 border-t border-border-subtle py-3 first:border-t-0 first:pt-0";

export default async function AdminTenantDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { created } = await searchParams;
  const result = await fetchAdminTenant(id);
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) {
    return <EmptyState icon={CloudOff} title="Detail tenant tidak dapat dimuat" description={result.error} />;
  }
  const tenant = result.data;

  const deactivated = tenant.status === "deactivated";
  const owner = tenant.owner;
  const ownerInvited = owner?.state === "invited" || owner?.state === "invitation_expired";
  const totalMembers = MEMBERSHIP_ROLES.reduce((sum, role) => sum + tenant.memberCounts[role], 0);

  return (
    <>
      <div className="px-1.5">
        <Link
          href="/admin/tenants"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-accent-strong underline-offset-4 hover:text-accent-hover hover:underline"
        >
          <ChevronLeft aria-hidden className="size-4" />
          Semua tenant
        </Link>
      </div>

      <PageHeader
        title={tenant.name}
        description={`Terdaftar ${formatDate(tenant.createdAt)}`}
        actions={
          <div className="flex items-center gap-3">
            <Badge tone={TENANT_STATUS_TONES[tenant.status]}>{TENANT_STATUS_LABELS[tenant.status]}</Badge>
            <TenantStatusActions tenantId={tenant.id} tenantName={tenant.name} deactivated={deactivated} />
          </div>
        }
      />

      {created === "1" && owner ? (
        <FormAlert tone="success">
          Tenant dibuat. Undangan dikirim ke <span className="font-bold">{owner.email}</span> — pemilik membuat password lewat tautan di email.
        </FormAlert>
      ) : null}
      {deactivated && tenant.deactivatedAt ? (
        <FormAlert tone="warning">
          <p className="font-bold">Tenant dinonaktifkan sejak {formatDateTime(tenant.deactivatedAt)}</p>
          <p className="text-text-secondary">Semua pengguna usaha ini tidak bisa masuk. Data tetap tersimpan.</p>
        </FormAlert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] lg:gap-5">
        <section className={CARD}>
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-h2 font-bold text-text-primary">Pemilik</h2>
            <p className="text-small text-text-secondary">Orang yang mengelola usaha ini dan mengundang pengguna lain.</p>
          </div>
          {owner ? (
            <dl className="flex flex-col">
              <div className={ROW}>
                <dt className="text-sm text-text-secondary">Nama</dt>
                <dd className="text-right text-sm font-bold text-text-primary">{owner.fullName}</dd>
              </div>
              <div className={ROW}>
                <dt className="text-sm text-text-secondary">Email</dt>
                <dd className="min-w-0 text-right text-sm break-all text-text-primary">{owner.email}</dd>
              </div>
              <div className={ROW}>
                <dt className="text-sm text-text-secondary">Status akun</dt>
                <dd className="text-right text-sm text-text-primary">{OWNER_STATE_LABELS[owner.state]}</dd>
              </div>
              {ownerInvited && owner.invitedAt ? (
                <div className={ROW}>
                  <dt className="text-sm text-text-secondary">Undangan dikirim</dt>
                  <dd className="text-right text-sm text-text-primary">{formatDateTime(owner.invitedAt)}</dd>
                </div>
              ) : null}
              {ownerInvited && owner.invitationExpiresAt ? (
                <div className={ROW}>
                  <dt className="text-sm text-text-secondary">{owner.state === "invitation_expired" ? "Kedaluwarsa" : "Berlaku sampai"}</dt>
                  <dd className={`text-right text-sm ${owner.state === "invitation_expired" ? "font-bold text-danger-text" : "text-text-primary"}`}>
                    {formatDateTime(owner.invitationExpiresAt)}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-text-secondary">Tenant ini belum punya pemilik.</p>
          )}
          {owner && ownerInvited && !deactivated ? <ResendOwnerInvitationButton tenantId={tenant.id} email={owner.email} /> : null}
        </section>

        <section className={CARD}>
          <div className="flex flex-col gap-1">
            <h2 className="font-display text-h2 font-bold text-text-primary">Pengguna</h2>
            <p className="text-small text-text-secondary">
              {tenant.pendingInvitations > 0 ? `${tenant.pendingInvitations} undangan belum diterima` : "Tidak ada undangan tertunda"}
            </p>
          </div>
          <dl className="flex flex-col">
            {MEMBERSHIP_ROLES.map((role) => (
              <div key={role} className={ROW}>
                <dt className="text-sm text-text-secondary">{ROLE_LABELS[role]}</dt>
                <dd className="text-sm text-text-primary tabular-nums">{tenant.memberCounts[role]}</dd>
              </div>
            ))}
            <div className={ROW}>
              <dt className="text-sm font-bold text-text-primary">Total</dt>
              <dd className="font-display text-base font-bold text-text-primary tabular-nums">{totalMembers}</dd>
            </div>
          </dl>
        </section>
      </div>

      <p className="px-1.5 text-caption text-text-tertiary">
        Panel super-admin hanya menampilkan data tingkat platform. Data karyawan, absensi, KPI, dan gaji tenant tidak dapat dilihat dari sini.
      </p>
    </>
  );
}
