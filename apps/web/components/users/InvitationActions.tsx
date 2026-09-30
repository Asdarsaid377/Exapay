"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cancelInvitation, resendInvitation } from "@/actions/users";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  invitationId: string;
  email: string;
};

type Status = { tone: "success" | "danger"; message: string } | null;

// Kirim ulang (tautan lama tidak berlaku) atau batalkan undangan tertunda. Batalkan lewat konfirmasi.
export function InvitationActions({ invitationId, email }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [resending, setResending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function handleResend() {
    setStatus(null);
    setResending(true);
    try {
      const outcome = await resendInvitation(invitationId);
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setStatus({ tone: "success", message: `Undangan baru dikirim ke ${email}. Tautan sebelumnya tidak berlaku lagi.` });
      router.refresh();
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setResending(false);
    }
  }

  async function handleCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      const outcome = await cancelInvitation(invitationId);
      if (outcome.kind === "error") {
        setCancelError(outcome.message);
        return;
      }
      setConfirmOpen(false);
      router.refresh();
    } catch {
      setCancelError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setCancelling(false);
    }
  }

  function closeConfirm() {
    setConfirmOpen(false);
    setCancelError(null);
  }

  return (
    <div className="flex flex-col gap-3 lg:items-end">
      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleResend} loading={resending}>
          {resending ? "Mengirim…" : "Kirim ulang"}
        </Button>
        <Button variant="secondary" onClick={() => setConfirmOpen(true)} disabled={resending}>
          Batalkan
        </Button>
      </div>
      {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
      <Dialog
        open={confirmOpen}
        onClose={closeConfirm}
        dismissible={!cancelling}
        title="Batalkan undangan?"
        description={`Tautan undangan yang dikirim ke ${email} tidak berlaku lagi. Anda bisa mengundangnya kembali kapan saja.`}
        footer={
          <>
            <Button variant="secondary" onClick={closeConfirm} disabled={cancelling}>
              Kembali
            </Button>
            <Button variant="dark" onClick={handleCancel} loading={cancelling}>
              {cancelling ? "Membatalkan…" : "Batalkan undangan"}
            </Button>
          </>
        }
      >
        {cancelError ? <FormAlert tone="danger">{cancelError}</FormAlert> : null}
      </Dialog>
    </div>
  );
}
