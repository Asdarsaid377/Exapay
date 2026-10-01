"use client";

import { changePasswordSchema, PASSWORD_MIN_LENGTH } from "@exapay/shared";
import { KeyRound } from "lucide-react";
import { type FormEvent, useState } from "react";

import { changePassword } from "@/actions/auth";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { PasswordField } from "@/components/common/PasswordField";

type FieldErrors = { currentPassword?: string; newPassword?: string; confirmPassword?: string };

// Ganti password dari /me/profile (feature 37) — form di Dialog, pola ResetPasswordForm. Sesi perangkat lain diakhiri API;
// sesi ini tetap (tidak perlu masuk ulang).
export function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function openDialog() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setFieldErrors({});
    setFormError(null);
    setDone(false);
    setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "currentPassword" || field === "newPassword") && !errors[field]) errors[field] = issue.message;
      }
    }
    if (confirmPassword !== newPassword) errors.confirmPassword = "Konfirmasi password tidak sama";
    setFieldErrors(errors);
    if (!parsed.success || errors.confirmPassword) return;

    setSubmitting(true);
    try {
      const outcome = await changePassword({ currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword });
      if (outcome.kind === "success") setDone(true);
      else setFormError(outcome.message);
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="lg" fullWidth onClick={openDialog}>
        <KeyRound aria-hidden className="size-4.5" />
        Ganti password
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!submitting}
        title={done ? "Password berhasil diubah" : "Ganti password"}
        description={
          done
            ? "Gunakan password baru saat masuk berikutnya. Demi keamanan, sesi di perangkat lain telah diakhiri."
            : "Password baru dipakai untuk masuk ke semua usaha yang terhubung dengan akun Anda."
        }
      >
        {done ? (
          <Button size="lg" fullWidth onClick={() => setOpen(false)}>
            Selesai
          </Button>
        ) : (
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
            <PasswordField
              id="current-password"
              label="Password saat ini"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              error={fieldErrors.currentPassword}
              disabled={submitting}
            />
            <PasswordField
              id="new-password"
              label="Password baru"
              autoComplete="new-password"
              placeholder={`Minimal ${PASSWORD_MIN_LENGTH} karakter`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={fieldErrors.newPassword}
              hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter. Gunakan kombinasi huruf dan angka agar lebih aman.`}
              disabled={submitting}
            />
            <PasswordField
              id="confirm-new-password"
              label="Konfirmasi password baru"
              autoComplete="new-password"
              placeholder="Ulangi password baru"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={fieldErrors.confirmPassword}
              disabled={submitting}
            />
            <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" size="lg" onClick={() => setOpen(false)} disabled={submitting}>
                Batal
              </Button>
              <Button type="submit" size="lg" loading={submitting}>
                {submitting ? "Menyimpan…" : "Simpan password baru"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
