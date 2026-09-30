"use client";

import { type OrgKind, orgItemSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createOrgItem, renameOrgItem } from "@/actions/organization";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextField } from "@/components/common/TextField";
import { ORG_LABELS } from "@/lib/organizationLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  kind: OrgKind;
  // Ada = ubah nama; tidak ada = tambah baru
  item?: { id: string; name: string };
};

// Dialog tambah / ubah nama departemen atau jabatan
export function OrgItemFormDialog({ open, onClose, kind, item }: Props) {
  const router = useRouter();
  const labels = ORG_LABELS[kind];
  const [name, setName] = useState(item?.name ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    setName(item?.name ?? "");
    setFieldError(null);
    setFormError(null);
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = orgItemSchema.safeParse({ name });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Nama tidak valid");
      return;
    }
    setFieldError(null);

    setSubmitting(true);
    try {
      const outcome = item ? await renameOrgItem(kind, item.id, parsed.data.name) : await createOrgItem(kind, parsed.data.name);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      // Tambah: kosongkan untuk entri berikutnya; ubah: nama baru jadi nilai awal
      setName(item ? parsed.data.name : "");
      onClose();
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} dismissible={!submitting} title={item ? `Ubah nama ${labels.singular}` : `Tambah ${labels.singular}`}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField
          id={`${kind}-${item?.id ?? "new"}-name`}
          label={`Nama ${labels.singular}`}
          placeholder={labels.placeholder}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldError ?? undefined}
          disabled={submitting}
        />
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? "Menyimpan…" : item ? "Simpan" : "Tambah"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
