"use client";

import { type InviteUserInput, inviteUserSchema, type MembershipRole } from "@exapay/shared";
import { MailCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { inviteUser } from "@/actions/users";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextField } from "@/components/common/TextField";
import { RoleOptions } from "@/components/users/RoleOptions";

type Props = {
  // Peran yang boleh diberikan pengguna ini (dari API)
  assignableRoles: MembershipRole[];
};

type Values = { fullName: string; email: string; role: MembershipRole | null };
type FieldErrors = Partial<Record<keyof InviteUserInput, string>>;

const EMPTY: Values = { fullName: "", email: "", role: null };

// Tombol "Undang pengguna" + dialog form. Sukses → dialog menampilkan konfirmasi; daftar undangan dimuat ulang.
export function InviteUserDialog({ assignableRoles }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  function reset() {
    setValues(EMPTY);
    setFieldErrors({});
    setFormError(null);
    setSentTo(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = inviteUserSchema.safeParse(values);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "fullName" || field === "email" || field === "role") && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const outcome = await inviteUser(parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      setSentTo(parsed.data.email);
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="size-4.5" />
        Undang pengguna
      </Button>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title={sentTo ? "Undangan terkirim" : "Undang pengguna"}
        description={sentTo ? undefined : "Pengguna menerima email berisi tautan untuk membuat password dan bergabung dengan usaha ini."}
      >
        {sentTo ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-field bg-success-soft text-success">
                <MailCheck aria-hidden className="size-5.5" />
              </div>
              <p className="text-sm text-text-secondary">
                Undangan dikirim ke <span className="font-bold break-all text-text-primary">{sentTo}</span> dan berlaku 7 hari. Anda bisa mengirim
                ulang atau membatalkannya dari daftar undangan tertunda.
              </p>
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={reset}>
                Undang orang lain
              </Button>
              <Button onClick={close}>Selesai</Button>
            </div>
          </div>
        ) : (
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
            {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
            <TextField
              id="invite-name"
              label="Nama lengkap"
              placeholder="Mis. Rina Marlina"
              autoComplete="off"
              value={values.fullName}
              onChange={(e) => setValues((current) => ({ ...current, fullName: e.target.value }))}
              error={fieldErrors.fullName}
              disabled={submitting}
            />
            <TextField
              id="invite-email"
              type="email"
              label="Email"
              placeholder="nama@email.com"
              autoComplete="off"
              value={values.email}
              onChange={(e) => setValues((current) => ({ ...current, email: e.target.value }))}
              error={fieldErrors.email}
              hint="Jika email ini sudah punya akun Exapay, usaha ini ditambahkan ke akun tersebut."
              disabled={submitting}
            />
            <RoleOptions
              legend="Peran"
              roles={assignableRoles}
              value={values.role}
              onChange={(role) => setValues((current) => ({ ...current, role }))}
              error={fieldErrors.role}
              disabled={submitting}
            />
            <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={close} disabled={submitting}>
                Batal
              </Button>
              <Button type="submit" loading={submitting}>
                {submitting ? "Mengirim…" : "Kirim undangan"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
