"use client";

import type { MembershipRole } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { changeMemberRole } from "@/actions/users";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { RoleOptions } from "@/components/users/RoleOptions";

type Props = {
  open: boolean;
  onClose: () => void;
  membershipId: string;
  fullName: string;
  currentRole: MembershipRole;
  assignableRoles: MembershipRole[];
};

// Ubah peran satu anggota. Sesi pengguna tsb memakai peran baru paling lambat 15 menit (umur access token).
export function ChangeRoleDialog({ open, onClose, membershipId, fullName, currentRole, assignableRoles }: Props) {
  const router = useRouter();
  const [role, setRole] = useState<MembershipRole>(currentRole);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setRole(currentRole);
    setError(null);
    onClose();
  }

  async function handleSave() {
    setError(null);
    setSubmitting(true);
    try {
      const outcome = await changeMemberRole(membershipId, role);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={`Ubah peran ${fullName}`}
      description="Menu dan akses pengguna ini mengikuti peran baru paling lambat 15 menit setelah disimpan."
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSave} loading={submitting} disabled={role === currentRole}>
            {submitting ? "Menyimpan…" : "Simpan peran"}
          </Button>
        </>
      }
    >
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      <RoleOptions legend="Peran" roles={assignableRoles} value={role} onChange={setRole} disabled={submitting} />
    </Dialog>
  );
}
