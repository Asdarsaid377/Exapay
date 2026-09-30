import { CloudOff } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { InviteUserDialog } from "@/components/users/InviteUserDialog";
import { MemberTable } from "@/components/users/MemberTable";
import { PendingInvitations } from "@/components/users/PendingInvitations";
import { fetchTenantUsers } from "@/lib/api/users";
import { getSession } from "@/lib/auth/getSession";

export const metadata: Metadata = { title: "Pengguna — Exapay" };

// Pengguna & undangan usaha aktif (feature 08). Proxy sudah membatasi ke owner/admin; API memeriksa ulang.
export default async function SettingsUsersPage() {
  const [session, result] = await Promise.all([getSession(), fetchTenantUsers()]);
  const tenantName = session?.activeTenant?.tenantName ?? "usaha ini";

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Pengguna" description={`Orang yang bisa masuk ke ${tenantName} beserta perannya.`} />
        <EmptyState icon={CloudOff} title="Daftar pengguna tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const { members, invitations, assignableRoles } = result.data;
  const ownerOnlyNote = assignableRoles.includes("owner") ? "" : " Sebagai admin, Anda dapat mengundang dan mengelola atasan serta karyawan.";

  return (
    <>
      <PageHeader
        title="Pengguna"
        description={`Orang yang bisa masuk ke ${tenantName} beserta perannya.${ownerOnlyNote}`}
        actions={<InviteUserDialog assignableRoles={assignableRoles} />}
      />
      {invitations.length > 0 ? <PendingInvitations invitations={invitations} /> : null}
      <MemberTable members={members} tenantName={tenantName} assignableRoles={assignableRoles} />
    </>
  );
}
