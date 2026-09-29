"use client";

import { PASSWORD_MIN_LENGTH, resetPasswordSchema } from "@exapay/shared";
import { CircleCheck, LinkIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { resetPassword } from "@/actions/auth";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { PasswordField } from "@/components/common/PasswordField";

type Props = {
  // null jika URL tidak membawa token
  token: string | null;
};

type FieldErrors = { password?: string; confirmPassword?: string };

type Status = "form" | "invalid-token" | "success";

const linkButtonClasses =
  "inline-flex w-full items-center justify-center rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-on-accent shadow-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export function ResetPasswordForm({ token }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(token ? "form" : "invalid-token");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: FieldErrors = {};
    const parsed = resetPasswordSchema.safeParse({ token, password });
    if (!parsed.success) {
      const passwordIssue = parsed.error.issues.find((issue) => issue.path[0] === "password");
      if (passwordIssue) errors.password = passwordIssue.message;
    }
    if (confirmPassword !== password) errors.confirmPassword = "Konfirmasi password tidak sama";
    setFieldErrors(errors);
    if (!parsed.success || errors.password || errors.confirmPassword) return;

    setSubmitting(true);
    try {
      const outcome = await resetPassword(parsed.data.token, parsed.data.password);
      if (outcome.kind === "success") setStatus("success");
      else if (outcome.kind === "invalid-token") setStatus("invalid-token");
      else setFormError(outcome.message);
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "success") {
    return (
      <>
        <div className="flex flex-col gap-4">
          <div className="flex size-11 items-center justify-center rounded-field bg-success-soft text-success">
            <CircleCheck aria-hidden className="size-5" />
          </div>
          <AuthHeading
            title="Password berhasil diubah"
            description="Silakan masuk dengan password baru Anda. Demi keamanan, sesi di perangkat lain telah diakhiri."
          />
        </div>
        <Link href="/login" className={linkButtonClasses}>
          Masuk sekarang
        </Link>
      </>
    );
  }

  if (status === "invalid-token") {
    return (
      <>
        <div className="flex flex-col gap-4">
          <div className="flex size-11 items-center justify-center rounded-field bg-warning-soft text-warning">
            <LinkIcon aria-hidden className="size-5" />
          </div>
          <AuthHeading
            title="Tautan tidak valid"
            description="Tautan reset password sudah kedaluwarsa, sudah pernah dipakai, atau tidak lengkap. Silakan minta tautan baru."
          />
        </div>
        <Link href="/forgot-password" className={linkButtonClasses}>
          Minta tautan baru
        </Link>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Buat password baru" description="Password baru akan dipakai untuk masuk ke semua usaha yang terhubung dengan akun Anda." />
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <PasswordField
          id="password"
          label="Password baru"
          autoComplete="new-password"
          placeholder={`Minimal ${PASSWORD_MIN_LENGTH} karakter`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter. Gunakan kombinasi huruf dan angka agar lebih aman.`}
          disabled={submitting}
        />
        <PasswordField
          id="confirm-password"
          label="Konfirmasi password baru"
          autoComplete="new-password"
          placeholder="Ulangi password baru"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={fieldErrors.confirmPassword}
          disabled={submitting}
        />
        <Button type="submit" fullWidth loading={submitting} className="mt-2">
          {submitting ? "Menyimpan…" : "Simpan password baru"}
        </Button>
      </form>
    </>
  );
}
