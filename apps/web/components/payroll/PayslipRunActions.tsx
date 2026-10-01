"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { publishPayslips, retryPayslips } from "@/actions/payslips";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";

type Props = {
  runId: string;
  title: string;
  // Slip siap yang belum terbit
  publishable: number;
  // Di antaranya yang punya akun portal (dikirimi email)
  publishableWithAccount: number;
  // Slip gagal / masih menunggu
  retryable: number;
};

const NETWORK_ERROR = "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.";

// Owner/admin: terbitkan slip siap (+ email tautan ke karyawan berakun portal) dan proses ulang slip gagal/tertunda
// (feature 31). Dialog konfirmasi pola PayrollFinalizeAction (izin user).
export function PayslipRunActions({ runId, title, publishable, publishableWithAccount, retryable }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"publish" | "retry" | null>(null);

  async function publish() {
    setError(null);
    setPending("publish");
    try {
      const outcome = await publishPayslips(runId);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(null);
    }
  }

  async function retry() {
    setError(null);
    setPending("retry");
    try {
      const outcome = await retryPayslips(runId);
      if (outcome.kind === "error") setError(outcome.message);
      else router.refresh();
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setPending(null);
    }
  }

  const withoutAccount = publishable - publishableWithAccount;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        {retryable > 0 ? (
          <Button variant="secondary" onClick={retry} loading={pending === "retry"} disabled={pending !== null}>
            {pending === "retry" ? "Memproses…" : "Proses ulang"}
          </Button>
        ) : null}
        <Button
          disabled={publishable === 0 || pending !== null}
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          {publishable > 0 ? `Terbitkan ${publishable} slip` : "Terbitkan slip"}
        </Button>
      </div>
      {error && !open ? <FormAlert tone="danger">{error}</FormAlert> : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={pending === null}
        title="Terbitkan slip gaji?"
        description={title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending !== null}>
              Batal
            </Button>
            <Button onClick={publish} loading={pending === "publish"}>
              {pending === "publish" ? "Menerbitkan…" : "Terbitkan"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
          <p className="text-body text-pretty text-text-primary">
            <span className="font-bold tabular-nums">{publishable} slip</span> akan bisa dilihat karyawan di portal
            {publishableWithAccount > 0 ? (
              <>
                , dan <span className="font-bold tabular-nums">{publishableWithAccount} karyawan</span> dikirimi email berisi tautan ke slipnya
              </>
            ) : null}
            .
          </p>
          <p className="text-small text-pretty text-text-secondary">
            Email tidak memuat angka gaji. Slip yang sudah terbit tidak bisa ditarik kembali
            {withoutAccount > 0 ? ` · ${withoutAccount} karyawan tanpa akun portal — bagikan PDF-nya secara langsung` : ""}.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
