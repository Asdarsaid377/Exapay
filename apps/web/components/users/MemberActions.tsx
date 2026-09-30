"use client";

import type { MembershipRole } from "@exapay/shared";
import { MoreHorizontal, UserCog, UserMinus } from "lucide-react";
import { useState } from "react";

import { DropdownMenu } from "@/components/common/DropdownMenu";
import { ChangeRoleDialog } from "@/components/users/ChangeRoleDialog";
import { RevokeMemberDialog } from "@/components/users/RevokeMemberDialog";

type Props = {
  membershipId: string;
  fullName: string;
  role: MembershipRole;
  tenantName: string;
  assignableRoles: MembershipRole[];
};

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Menu aksi per anggota (ubah peran / cabut akses). Setiap aksi lewat dialog.
export function MemberActions({ membershipId, fullName, role, tenantName, assignableRoles }: Props) {
  const [dialog, setDialog] = useState<"role" | "revoke" | null>(null);

  return (
    <>
      <DropdownMenu
        label={`Aksi untuk ${fullName}`}
        align="end"
        panelClassName="w-56"
        triggerClassName="grid size-10 place-items-center rounded-field text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary"
        trigger={<MoreHorizontal aria-hidden className="size-5" />}
      >
        {(close) => (
          <>
            <button
              type="button"
              className={`${ITEM} text-text-primary hover:bg-accent/10`}
              onClick={() => {
                close();
                setDialog("role");
              }}
            >
              <UserCog aria-hidden className="size-4.5 text-text-secondary" />
              Ubah peran
            </button>
            <button
              type="button"
              className={`${ITEM} font-bold text-danger-text hover:bg-danger/8`}
              onClick={() => {
                close();
                setDialog("revoke");
              }}
            >
              <UserMinus aria-hidden className="size-4.5" />
              Cabut akses
            </button>
          </>
        )}
      </DropdownMenu>
      <ChangeRoleDialog
        key={role}
        open={dialog === "role"}
        onClose={() => setDialog(null)}
        membershipId={membershipId}
        fullName={fullName}
        currentRole={role}
        assignableRoles={assignableRoles}
      />
      <RevokeMemberDialog
        open={dialog === "revoke"}
        onClose={() => setDialog(null)}
        membershipId={membershipId}
        fullName={fullName}
        tenantName={tenantName}
      />
    </>
  );
}
