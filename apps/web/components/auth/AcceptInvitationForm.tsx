"use client";

import { acceptInvitationSchema, type InvitationPreview, PASSWORD_MIN_LENGTH } from "@exapay/shared";
import { CircleCheck, LinkIcon } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";

import { acceptInvitation } from "@/actions/invitations";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { Button, buttonClassName } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { PasswordField } from "@/components/common/PasswordField";
import { TextField } from "@/components/common/TextField";
import { formatDateTime } from "@/lib/datetime";
import { ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  token: string;
  // null: tautan tidak valid / sudah dipakai
  invitation: InvitationPreview | null;
};

type FieldErrors = { fullName?: string; password?: string; confirmPassword?: string };

type Status = "form" | "invalid" | "success";

function StatusIcon({ tone }: { tone: "success" | "warning" }) {
  const Icon = tone === "success" ? CircleCheck : LinkIcon;
  return (
    <div className={`flex size-11 items-center justify-center rounded-field ${tone === "success" ? "bg-success-soft text-success" : "bg-warning-soft text-warning-icon"}`}>
      <Icon aria-hidden className="size-5" />
    </div>
  );
}

// Terima undangan bergabung ke usaha. Email baru → buat akun (nama + password); email terdaftar → cukup terima.
export function AcceptInvitationForm({ token, invitation }: Props) {
  const [fullName, setFullName] = useState(invitation?.fullName ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(invitation ? "form" : "invalid");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation) return;
    setFormError(null);

    const input = invitation.accountExists ? { token } : { token, fullName, password };
    const errors: FieldErrors = {};
    const parsed = acceptInvitationSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "fullName" || field === "password") && !errors[field]) errors[field] = issue.message;
      }
    }
    if (!invitation.accountExists && confirmPassword !== password) errors.confirmPassword = "Konfirmasi password tidak sama";
    setFieldErrors(errors);
    if (!parsed.success || Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const outcome = await acceptInvitation(parsed.data);
      if (outcome.kind === "success") setStatus("success");
      else if (outcome.kind === "invalid-token") setStatus("invalid");
      else setFormError(outcome.message);
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "success" && invitation) {
    return (
      <>
        <div className="flex flex-col gap-4">
          <StatusIcon tone="success" />
          <AuthHeading
            title={`Anda bergabung dengan ${invitation.tenantName}`}
            description={
              invitation.accountExists
                ? "Masuk dengan email dan password akun Exapay Anda, lalu pilih usaha ini."
                : `Akun Anda sudah siap. Masuk dengan ${invitation.email} dan password yang baru Anda buat.`
            }
          />
        </div>
        <Link href="/login" className={buttonClassName({ size: "lg", fullWidth: true })}>
          Masuk sekarang
        </Link>
      </>
    );
  }

  if (status === "invalid" || !invitation) {
    return (
      <>
        <div className="flex flex-col gap-4">
          <StatusIcon tone="warning" />
          <AuthHeading
            title="Tautan undangan tidak valid"
            description="Undangan ini sudah pernah dipakai, sudah diganti dengan undangan baru, atau tautannya tidak lengkap. Jika Anda sudah menerimanya, silakan masuk."
          />
        </div>
        <Link href="/login" className={buttonClassName({ size: "lg", fullWidth: true })}>
          Ke halaman masuk
        </Link>
      </>
    );
  }

  if (invitation.expired) {
    return (
      <>
        <div className="flex flex-col gap-4">
          <StatusIcon tone="warning" />
          <AuthHeading
            title="Undangan sudah kedaluwarsa"
            description={`Undangan bergabung dengan ${invitation.tenantName} berakhir ${formatDateTime(invitation.expiresAt)}. Minta pengirim undangan untuk mengirim ulang.`}
          />
        </div>
        <Link href="/login" className={buttonClassName({ variant: "secondary", size: "lg", fullWidth: true })}>
          Ke halaman masuk
        </Link>
      </>
    );
  }

  const roleLabel = ROLE_LABELS[invitation.role].toLowerCase();

  return (
    <>
      <AuthHeading
        title={`Bergabung dengan ${invitation.tenantName}`}
        description={
          invitation.accountExists
            ? `Anda diundang sebagai ${roleLabel}. Email ${invitation.email} sudah punya akun Exapay — usaha ini akan ditambahkan ke akun tersebut.`
            : `Anda diundang sebagai ${roleLabel}. Buat password untuk akun Exapay Anda.`
        }
      />
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField id="email" type="email" label="Email" value={invitation.email} disabled readOnly />
        {invitation.accountExists ? null : (
          <>
            <TextField
              id="full-name"
              label="Nama lengkap"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={fieldErrors.fullName}
              disabled={submitting}
            />
            <PasswordField
              id="password"
              label="Password"
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
              label="Konfirmasi password"
              autoComplete="new-password"
              placeholder="Ulangi password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={fieldErrors.confirmPassword}
              disabled={submitting}
            />
          </>
        )}
        <Button type="submit" size="lg" fullWidth loading={submitting} className="mt-2">
          {submitting ? "Memproses…" : invitation.accountExists ? "Terima undangan" : "Buat akun & bergabung"}
        </Button>
        <p className="text-center text-caption text-text-tertiary">Undangan berlaku sampai {formatDateTime(invitation.expiresAt)}.</p>
      </form>
    </>
  );
}
