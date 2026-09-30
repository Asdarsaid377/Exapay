"use client";

import { PASSWORD_MIN_LENGTH, signupSchema, type SignupInput } from "@exapay/shared";
import { MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";

import { signup } from "@/actions/auth";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { ResendVerificationButton } from "@/components/auth/ResendVerificationButton";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { PasswordField } from "@/components/common/PasswordField";
import { TextField } from "@/components/common/TextField";

type Field = keyof SignupInput;
type FieldErrors = Partial<Record<Field, string>>;

const FIELDS: readonly Field[] = ["fullName", "companyName", "email", "password"];

function isField(value: unknown): value is Field {
  return typeof value === "string" && FIELDS.some((field) => field === value);
}

const EMPTY_FORM: SignupInput = { fullName: "", companyName: "", email: "", password: "" };

export function SignupForm() {
  const [values, setValues] = useState<SignupInput>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function update(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = signupSchema.safeParse(values);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (isField(field) && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const outcome = await signup(parsed.data);
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
          <div className="flex size-11 items-center justify-center rounded-field bg-accent-soft text-accent-strong">
            <MailCheck aria-hidden className="size-5" />
          </div>
          <div className="flex flex-col gap-1.5">
            <AuthHeading title="Periksa email Anda" />
            <p className="text-sm text-text-secondary">
              Kami telah mengirim tautan verifikasi ke <span className="font-medium text-text-primary">{sentTo}</span>. Buka tautan
              tersebut untuk mengaktifkan akun, lalu masuk ke Exapay. Tautan berlaku selama 24 jam.
            </p>
          </div>
          <p className="text-caption text-text-tertiary">Tidak menerima email? Periksa folder spam, atau kirim ulang di bawah.</p>
        </div>
        <div className="flex flex-col gap-3">
          <ResendVerificationButton email={sentTo} startWithCooldown />
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setValues((current) => ({ ...current, password: "" }));
            }}
            className="text-sm font-medium text-accent-strong underline-offset-4 hover:underline"
          >
            Salah email? Ubah data pendaftaran
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Daftarkan usaha Anda" description="Buat akun pemilik usaha. Setelah verifikasi email, Anda bisa langsung mulai." />
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField
          id="full-name"
          label="Nama lengkap"
          autoComplete="name"
          placeholder="Nama Anda"
          value={values.fullName}
          onChange={(e) => update("fullName", e.target.value)}
          error={fieldErrors.fullName}
          disabled={submitting}
        />
        <TextField
          id="company-name"
          label="Nama usaha"
          autoComplete="organization"
          placeholder="mis. Kopi Nusantara"
          value={values.companyName}
          onChange={(e) => update("companyName", e.target.value)}
          error={fieldErrors.companyName}
          hint="Bisa diubah nanti di pengaturan profil usaha."
          disabled={submitting}
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="nama@usaha.com"
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
          error={fieldErrors.email}
          disabled={submitting}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="new-password"
          placeholder={`Minimal ${PASSWORD_MIN_LENGTH} karakter`}
          value={values.password}
          onChange={(e) => update("password", e.target.value)}
          error={fieldErrors.password}
          hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter. Gunakan kombinasi huruf dan angka agar lebih aman.`}
          disabled={submitting}
        />
        <Button type="submit" size="lg" fullWidth loading={submitting} className="mt-2">
          {submitting ? "Mendaftarkan…" : "Daftar"}
        </Button>
      </form>
    </>
  );
}
