"use client";

import { type CreateTenantInput, createTenantSchema } from "@exapay/shared";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createTenant } from "@/actions/adminTenants";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextField } from "@/components/common/TextField";

type FieldErrors = Partial<Record<keyof CreateTenantInput, string>>;

const EMPTY: CreateTenantInput = { name: "", ownerFullName: "", ownerEmail: "" };

// Tombol "Buat tenant" + dialog form. Sukses → buka detail tenant (undangan pemilik sudah dikirim).
export function CreateTenantDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<CreateTenantInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof CreateTenantInput, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function close() {
    setOpen(false);
    setValues(EMPTY);
    setFieldErrors({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = createTenantSchema.safeParse(values);
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "name" || field === "ownerFullName" || field === "ownerEmail") && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const outcome = await createTenant(parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      router.push(`/admin/tenants/${outcome.tenantId}?created=1`);
      close();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden className="size-4.5" />
        Buat tenant
      </Button>
      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title="Buat tenant baru"
        description="Usaha dibuat dengan data bawaan, lalu pemilik menerima email undangan untuk membuat password dan masuk."
      >
        <form id="create-tenant-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <TextField
            id="tenant-name"
            label="Nama usaha"
            placeholder="Mis. Konveksi Sari Jaya"
            autoComplete="organization"
            value={values.name}
            onChange={(e) => update("name", e.target.value)}
            error={fieldErrors.name}
            disabled={submitting}
          />
          <TextField
            id="owner-name"
            label="Nama pemilik"
            placeholder="Nama lengkap pemilik usaha"
            autoComplete="off"
            value={values.ownerFullName}
            onChange={(e) => update("ownerFullName", e.target.value)}
            error={fieldErrors.ownerFullName}
            disabled={submitting}
          />
          <TextField
            id="owner-email"
            type="email"
            label="Email pemilik"
            placeholder="nama@usaha.com"
            autoComplete="off"
            value={values.ownerEmail}
            onChange={(e) => update("ownerEmail", e.target.value)}
            error={fieldErrors.ownerEmail}
            hint="Undangan berlaku 7 hari. Jika email ini sudah punya akun Exapay, usaha ditambahkan ke akun tersebut."
            disabled={submitting}
          />
          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Batal
            </Button>
            <Button type="submit" loading={submitting}>
              {submitting ? "Membuat…" : "Buat & kirim undangan"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
