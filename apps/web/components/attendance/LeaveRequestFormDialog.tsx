"use client";

import { LEAVE_ATTACHMENT_ACCEPT, LEAVE_ATTACHMENT_MAX_BYTES, LEAVE_TYPE_LABELS, LEAVE_TYPES, type LeaveType, leaveRequestInputSchema } from "@exapay/shared";
import { FileText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { submitLeaveRequest } from "@/actions/leaveRequests";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FileDropzone } from "@/components/common/FileDropzone";
import { FormAlert } from "@/components/common/FormAlert";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { formatFileSize } from "@/lib/leaveLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  // Tanggal hari ini di zona waktu usaha — default tanggal mulai & selesai
  today: string;
};

type Field = "startDate" | "endDate" | "reason" | "attachment";
type FieldErrors = Partial<Record<Field, string>>;

const TYPE_OPTIONS = LEAVE_TYPES.map((value) => ({ value, label: LEAVE_TYPE_LABELS[value] }));
const ATTACHMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const REASON_PLACEHOLDERS: Record<LeaveType, string> = {
  permit: "Mis. mengurus KTP di kantor kecamatan",
  sick: "Mis. demam, istirahat sesuai saran dokter",
  leave: "Mis. acara pernikahan keluarga di kampung",
};

// Dialog ajukan izin/sakit/cuti (portal /me/attendance). Rentang hari penuh + alasan + lampiran opsional (mis. surat dokter).
// Tanpa referensi desain — pola CompanyHolidayFormDialog + FileDropzone (feature 15, izin user).
export function LeaveRequestFormDialog({ open, onClose, today }: Props) {
  const router = useRouter();
  const [type, setType] = useState<LeaveType>("permit");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setType("permit");
    setStartDate(today);
    setEndDate(today);
    setReason("");
    setFile(null);
    setFieldErrors({});
    setFormError(null);
  }

  function close() {
    reset();
    onClose();
  }

  function selectFile(selected: File) {
    if (!ATTACHMENT_EXTENSIONS.some((ext) => selected.name.toLowerCase().endsWith(ext))) {
      setFieldErrors((errors) => ({ ...errors, attachment: "Lampiran harus berupa PDF, JPG, atau PNG" }));
      return;
    }
    if (selected.size > LEAVE_ATTACHMENT_MAX_BYTES) {
      setFieldErrors((errors) => ({ ...errors, attachment: "Lampiran terlalu besar (maks. 5 MB)" }));
      return;
    }
    setFieldErrors((errors) => ({ ...errors, attachment: undefined }));
    setFile(selected);
  }

  function changeStartDate(value: string) {
    setStartDate(value);
    // Tanggal selesai ikut maju agar rentang tidak terbalik
    if (value && endDate < value) setEndDate(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = leaveRequestInputSchema.safeParse({ type, startDate, endDate, reason });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "startDate" || field === "endDate" || field === "reason") && !errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const formData = new FormData();
    formData.set("type", parsed.data.type);
    formData.set("startDate", parsed.data.startDate);
    formData.set("endDate", parsed.data.endDate);
    formData.set("reason", parsed.data.reason);
    if (file) formData.set("attachment", file, file.name);

    setSubmitting(true);
    try {
      const outcome = await submitLeaveRequest(formData);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      close();
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!submitting}
      title="Ajukan izin"
      description="Pengajuan dikirim ke atasan langsung Anda untuk disetujui. Hari libur di dalam rentang tidak dihitung."
    >
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4.5">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className="text-[13px] font-bold text-text-primary">
            Jenis
          </span>
          <SegmentedControl label="Jenis pengajuan" options={TYPE_OPTIONS} value={type} onChange={setType} disabled={submitting} fullWidth size="lg" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="leave-start-date"
            label="Mulai"
            type="date"
            value={startDate}
            onChange={(e) => changeStartDate(e.target.value)}
            error={fieldErrors.startDate}
            disabled={submitting}
          />
          <TextField
            id="leave-end-date"
            label="Sampai"
            type="date"
            min={startDate || undefined}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            error={fieldErrors.endDate}
            disabled={submitting}
          />
        </div>
        <TextAreaField
          id="leave-reason"
          label="Alasan"
          placeholder={REASON_PLACEHOLDERS[type]}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={fieldErrors.reason}
          disabled={submitting}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-text-primary">
            Lampiran <span className="font-normal text-text-tertiary">(opsional)</span>
          </span>
          {file ? (
            <div className="flex items-center gap-3 rounded-field border border-border-control bg-control py-1.5 pr-1.5 pl-3.5">
              <FileText aria-hidden className="size-5 shrink-0 text-text-secondary" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-bold text-text-primary">{file.name}</span>
                <span className="text-caption text-text-tertiary tabular-nums">{formatFileSize(file.size)}</span>
              </div>
              <button
                type="button"
                aria-label={`Hapus lampiran ${file.name}`}
                disabled={submitting}
                onClick={() => setFile(null)}
                className="grid size-11 shrink-0 place-items-center rounded-field text-text-secondary transition-colors hover:bg-fill-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:opacity-50"
              >
                <X aria-hidden className="size-4.5" />
              </button>
            </div>
          ) : (
            <FileDropzone
              id="leave-attachment"
              accept={LEAVE_ATTACHMENT_ACCEPT}
              hint="PDF, JPG, atau PNG · maks. 5 MB · mis. surat dokter"
              onSelect={selectFile}
              disabled={submitting}
              error={fieldErrors.attachment}
            />
          )}
        </div>
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Batal
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting ? "Mengirim…" : "Kirim pengajuan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
