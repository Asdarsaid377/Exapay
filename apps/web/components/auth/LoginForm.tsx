"use client";

import { loginSchema, type TenantMembership } from "@exapay/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { login, logout, selectTenant } from "@/actions/auth";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { TenantPicker } from "@/components/auth/TenantPicker";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { PasswordField } from "@/components/common/PasswordField";
import { TextField } from "@/components/common/TextField";

type FieldErrors = { email?: string; password?: string };

type Step = { kind: "credentials" } | { kind: "select-tenant"; tenants: TenantMembership[] } | { kind: "redirecting"; to: string };

type Props = {
  // Sudah login tapi belum memilih usaha → mulai langsung di langkah pilih usaha
  initialTenants?: TenantMembership[];
  // Halaman yang diminta sebelum diarahkan ke login (dari proxy)
  next?: string;
};

// Hanya path internal — cegah open redirect ke situs lain
function safeNext(next: string | undefined): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export function LoginForm({ initialTenants, next }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTenantId, setPendingTenantId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(
    initialTenants && initialTenants.length > 0 ? { kind: "select-tenant", tenants: initialTenants } : { kind: "credentials" },
  );
  const [switchingAccount, setSwitchingAccount] = useState(false);

  function goTo(path: string) {
    const destination = safeNext(next) ?? path;
    setStep({ kind: "redirecting", to: destination });
    router.replace(destination);
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "email" || field === "password") && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const outcome = await login({ email: parsed.data.email, password: parsed.data.password });
      if (outcome.kind === "error") setFormError(outcome.message);
      else if (outcome.kind === "select-tenant") setStep({ kind: "select-tenant", tenants: outcome.tenants });
      else goTo(outcome.redirectTo);
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSelectTenant(tenantId: string) {
    setFormError(null);
    setPendingTenantId(tenantId);
    try {
      const outcome = await selectTenant(tenantId);
      if (outcome.kind === "error") setFormError(outcome.message);
      else goTo(outcome.redirectTo);
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setPendingTenantId(null);
    }
  }

  if (step.kind === "redirecting") {
    return (
      <>
        <AuthHeading title="Berhasil masuk" />
        <FormAlert tone="success">Mengarahkan Anda ke halaman utama…</FormAlert>
      </>
    );
  }

  if (step.kind === "select-tenant") {
    return (
      <>
        <AuthHeading title="Pilih usaha" description="Akun Anda terhubung ke beberapa usaha. Pilih usaha yang ingin dibuka." />
        <div className="flex flex-col gap-4">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <TenantPicker tenants={step.tenants} pendingTenantId={pendingTenantId} onSelect={handleSelectTenant} />
          <Button
            variant="secondary"
            fullWidth
            loading={switchingAccount}
            disabled={pendingTenantId !== null}
            onClick={async () => {
              // Akhiri sesi saat ini (server action logout mengarahkan kembali ke /login)
              setSwitchingAccount(true);
              await logout();
            }}
          >
            Masuk dengan akun lain
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Masuk ke Exapay" description="Kelola gaji, absensi, dan kinerja karyawan dalam satu tempat." />
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
          error={fieldErrors.email}
          disabled={submitting}
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          placeholder="Masukkan password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          disabled={submitting}
          labelAction={
            <Link href="/forgot-password" className="text-xs font-medium text-accent-strong hover:underline underline-offset-4">
              Lupa password?
            </Link>
          }
        />
        <Button type="submit" fullWidth loading={submitting} className="mt-2">
          {submitting ? "Memproses…" : "Masuk"}
        </Button>
      </form>
    </>
  );
}
