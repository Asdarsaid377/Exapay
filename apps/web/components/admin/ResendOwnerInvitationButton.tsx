"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { resendOwnerInvitation } from "@/actions/adminTenants";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  tenantId: string;
  email: string;
};

// Kirim undangan pemilik baru (undangan lama tidak berlaku lagi). Sukses → data detail dimuat ulang.
export function ResendOwnerInvitationButton({ tenantId, email }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setStatus(null);
    setSubmitting(true);
    try {
      const outcome = await resendOwnerInvitation(tenantId);
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setStatus({ tone: "success", message: `Undangan baru dikirim ke ${email}. Tautan sebelumnya tidak berlaku lagi.` });
      router.refresh();
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
      <div>
        <Button variant="secondary" onClick={handleClick} loading={submitting}>
          {submitting ? "Mengirim…" : "Kirim ulang undangan"}
        </Button>
      </div>
    </div>
  );
}
