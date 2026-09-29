"use client";

import { forgotPasswordSchema } from "@exapay/shared";
import { MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";

import { requestPasswordReset } from "@/actions/auth";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { TextField } from "@/components/common/TextField";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);

    setSubmitting(true);
    try {
      const outcome = await requestPasswordReset(parsed.data.email);
      if (outcome.kind === "success") setSentTo(parsed.data.email);
      else setFormError(outcome.kind === "error" ? outcome.message : "Terjadi kesalahan. Silakan coba lagi.");
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <>
        <div className="flex flex-col gap-4">
          <div className="flex size-11 items-center justify-center rounded-field bg-accent-soft text-accent">
            <MailCheck aria-hidden className="size-5" />
          </div>
          <div className="flex flex-col gap-1.5">
            <AuthHeading title="Periksa email Anda" />
            <p className="text-sm text-text-secondary">
              Jika <span className="font-medium text-text-primary">{sentTo}</span> terdaftar di Exapay, kami telah mengirim
              tautan untuk mengatur ulang password. Tautan berlaku selama 1 jam.
            </p>
          </div>
          <p className="text-xs text-text-muted">Tidak menerima email? Periksa folder spam, atau kirim ulang dalam beberapa menit.</p>
        </div>
        <Button variant="secondary" fullWidth onClick={() => setSentTo(null)}>
          Kirim ulang
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Lupa password" description="Masukkan email akun Anda. Kami akan mengirim tautan untuk membuat password baru." />
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="nama@usaha.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
          disabled={submitting}
        />
        <Button type="submit" fullWidth loading={submitting} className="mt-2">
          {submitting ? "Mengirim…" : "Kirim tautan reset"}
        </Button>
      </form>
    </>
  );
}
