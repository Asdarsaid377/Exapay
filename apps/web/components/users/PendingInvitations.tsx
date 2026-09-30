import type { TenantPendingInvitation } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { InvitationActions } from "@/components/users/InvitationActions";
import { formatShortDate } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  invitations: TenantPendingInvitation[];
};

function sentLine(invitation: TenantPendingInvitation): string {
  const by = invitation.invitedByName ? ` oleh ${invitation.invitedByName}` : "";
  const validity = invitation.expired ? "" : ` · berlaku sampai ${formatShortDate(invitation.expiresAt)}`;
  return `Dikirim ${formatShortDate(invitation.invitedAt)}${by}${validity}`;
}

// Undangan yang belum diterima. Kedaluwarsa ditandai badge — kirim ulang membuat tautan baru.
export function PendingInvitations({ invitations }: Props) {
  return (
    <section aria-labelledby="pending-invitations-title" className="glass-strong flex flex-col rounded-card">
      <div className="flex flex-col gap-1 px-5 pt-5 pb-3 lg:px-6">
        <h2 id="pending-invitations-title" className="font-display text-h2 font-bold text-text-primary">
          Undangan tertunda
        </h2>
        <p className="text-small text-text-secondary">
          {invitations.length} undangan belum diterima. Pengguna muncul di daftar anggota setelah menerima undangan.
        </p>
      </div>
      <ul>
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-bold text-text-primary">{invitation.fullName}</p>
                <Badge tone="neutral">{ROLE_LABELS[invitation.role]}</Badge>
                {invitation.expired ? <Badge tone="danger">Kedaluwarsa</Badge> : <Badge tone="warning">Menunggu</Badge>}
              </div>
              <p className="text-small break-all text-text-secondary">{invitation.email}</p>
              <p className="text-caption text-text-tertiary">{sentLine(invitation)}</p>
            </div>
            {invitation.canManage ? (
              <InvitationActions invitationId={invitation.id} email={invitation.email} />
            ) : (
              <p className="text-caption text-text-tertiary lg:max-w-56 lg:text-right">Hanya pemilik yang bisa mengelola undangan ini.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
