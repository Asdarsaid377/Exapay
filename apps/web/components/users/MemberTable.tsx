import type { MembershipRole, TenantMember } from "@exapay/shared";

import { Badge } from "@/components/common/Badge";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { MemberActions } from "@/components/users/MemberActions";
import { formatShortDate } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  members: TenantMember[];
  tenantName: string;
  assignableRoles: MembershipRole[];
};

const HEAD = "px-4 pb-3 text-left text-caption font-bold text-text-tertiary first:pl-6 last:pr-6";
const CELL = "px-4 py-3.5 align-middle first:pl-6 last:pr-6";

function NameCell({ member }: { member: TenantMember }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <UserAvatar fullName={member.fullName} />
      <div className="flex min-w-0 flex-col">
        <p className="flex items-center gap-2 text-[15px] font-bold text-text-primary">
          <span className="truncate">{member.fullName}</span>
          {member.isSelf ? <span className="shrink-0 text-caption font-medium text-text-tertiary">(Anda)</span> : null}
        </p>
        <p className="truncate text-small text-text-secondary">{member.email}</p>
      </div>
    </div>
  );
}

// Daftar anggota usaha di card kaca kuat. Desktop: tabel; mobile: baris bertumpuk.
// Tanpa overflow-hidden: menu aksi (dropdown) di baris bawah tidak boleh terpotong.
export function MemberTable({ members, tenantName, assignableRoles }: Props) {
  function actionsFor(member: TenantMember) {
    if (!member.canManage) return null;
    return (
      <MemberActions
        membershipId={member.membershipId}
        fullName={member.fullName}
        role={member.role}
        tenantName={tenantName}
        assignableRoles={assignableRoles}
      />
    );
  }

  return (
    <section aria-labelledby="members-title" className="glass-strong rounded-card">
      <div className="flex flex-col gap-1 px-5 pt-5 pb-3 lg:px-6">
        <h2 id="members-title" className="font-display text-h2 font-bold text-text-primary">
          Anggota
        </h2>
        <p className="text-small text-text-secondary">{members.length} pengguna bisa masuk ke usaha ini.</p>
      </div>
      <table className="hidden w-full lg:table">
        <thead>
          <tr>
            <th scope="col" className={`${HEAD} pt-2`}>
              Nama
            </th>
            <th scope="col" className={`${HEAD} pt-2`}>
              Peran
            </th>
            <th scope="col" className={`${HEAD} pt-2`}>
              Bergabung
            </th>
            <th scope="col" className={`${HEAD} pt-2`}>
              <span className="sr-only">Aksi</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <tr key={member.membershipId} className="border-t border-border-subtle">
              <td className={CELL}>
                <NameCell member={member} />
              </td>
              <td className={CELL}>
                <Badge tone="neutral">{ROLE_LABELS[member.role]}</Badge>
              </td>
              <td className={`${CELL} text-sm text-text-secondary`}>{formatShortDate(member.joinedAt)}</td>
              <td className={`${CELL} w-14 text-right`}>{actionsFor(member)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="lg:hidden">
        {members.map((member) => (
          <li key={member.membershipId} className="flex items-center gap-3 border-t border-border-subtle px-5 py-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <NameCell member={member} />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-13">
                <Badge tone="neutral">{ROLE_LABELS[member.role]}</Badge>
                <span className="text-caption whitespace-nowrap text-text-tertiary">Bergabung {formatShortDate(member.joinedAt)}</span>
              </div>
            </div>
            <div className="shrink-0">{actionsFor(member)}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
