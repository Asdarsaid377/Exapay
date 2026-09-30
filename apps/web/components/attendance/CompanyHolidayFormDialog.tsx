"use client";

import { companyHolidayInputSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createCompanyHoliday, updateCompanyHoliday } from "@/actions/workCalendar";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextField } from "@/components/common/TextField";
import { attendanceSettingsHref } from "@/lib/workCalendarLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  // Tahun yang sedang ditampilkan & tahun berjalan — simpan di tahun lain → pindah ke tahun itu
  year: number;
  currentYear: number;
  // Ada = ubah; tidak ada = tambah baru
  holiday?: { id: string; date: string; name: string };
};

type FieldErrors = Partial<Record<"date" | "name", string>>;

// Dialog tambah / ubah libur usaha (tanggal + keterangan)
export function CompanyHolidayFormDialog({ open, onClose, year, currentYear, holiday }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(holiday?.date ?? "");
  const [name, setName] = useState(holiday?.name ?? "");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setDate(holiday?.date ?? "");
    setName(holiday?.name ?? "");
    setFieldErrors({});
    setFormError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = companyHolidayInputSchema.safeParse({ date, name });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] === "date" ? "date" : issue.path[0] === "name" ? "name" : null;
        if (field && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const outcome = holiday ? await updateCompanyHoliday(holiday.id, parsed.data) : await createCompanyHoliday(parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      if (!holiday) {
        setDate("");
        setName("");
      }
      onClose();
      const savedYear = Number(parsed.data.date.slice(0, 4));
      if (savedYear !== year) router.push(attendanceSettingsHref(savedYear, currentYear), { scroll: false });
      else router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const idPrefix = `company-holiday-${holiday?.id ?? "new"}`;
  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title={holiday ? "Ubah libur usaha" : "Tambah libur usaha"}
      description="Hari libur khusus usaha Anda, mis. ulang tahun usaha atau libur daerah. Karyawan tidak dihitung alpa di tanggal ini."
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField
          id={`${idPrefix}-date`}
          label="Tanggal"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          error={fieldErrors.date}
          disabled={submitting}
        />
        <TextField
          id={`${idPrefix}-name`}
          label="Keterangan"
          placeholder="Mis. Ulang tahun toko"
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={fieldErrors.name}
          disabled={submitting}
        />
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? "Menyimpan…" : holiday ? "Simpan" : "Tambah"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
