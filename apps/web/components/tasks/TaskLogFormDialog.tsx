"use client";

import { TASK_PHOTO_ACCEPT, TASK_PHOTO_MAX_BYTES, type TaskIndicatorDay, type TaskLog, taskLogInputSchema } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { submitTaskLog, updateTaskLog } from "@/actions/taskLogs";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FileDropzone } from "@/components/common/FileDropzone";
import { FormAlert } from "@/components/common/FormAlert";
import { SelectField } from "@/components/common/SelectField";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { TaskPhotoRow } from "@/components/tasks/TaskPhotoRow";
import { shrinkPhoto } from "@/lib/imageResize";
import { formatFileSize } from "@/lib/leaveLabels";
import { longDate, myTaskPhotoHref, normalizeQuantityInput, targetLabel } from "@/lib/taskLogLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  // Tanggal kerja catatan (YYYY-MM-DD, zona waktu usaha)
  workDate: string;
  // Indikator template jabatan saat ini yang dicatat karyawan
  indicators: TaskIndicatorDay[];
  // Ada = mode ubah
  log?: TaskLog;
};

type Field = "indicatorId" | "quantity" | "note" | "photo";
type FieldErrors = Partial<Record<Field, string>>;

// Nilai <select> untuk pekerjaan di luar indikator template
const OTHER = "other";

function initialKind(indicators: TaskIndicatorDay[], log: TaskLog | undefined): string {
  if (log) return log.indicator?.id ?? OTHER;
  return indicators[0]?.id ?? OTHER;
}

// Dialog catat / ubah tugas (portal /me & /me/tasks). Pilih indikator template jabatan (isi realisasi) atau "Pekerjaan lain"
// (deskripsi wajib), catatan & foto bukti opsional. Foto kamera diperkecil di browser sebelum dikirim.
// Tanpa referensi desain — pola LeaveRequestFormDialog (feature 19, izin user).
export function TaskLogFormDialog({ open, onClose, workDate, indicators, log }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState(() => initialKind(indicators, log));
  const [quantity, setQuantity] = useState(log?.quantity?.replace(".", ",") ?? "");
  const [note, setNote] = useState(log?.note ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const indicator = indicators.find((candidate) => candidate.id === kind) ?? null;
  // Indikator catatan lama yang sudah tidak ada di template jabatan (mis. jabatan pindah) tetap ditampilkan sebagai pilihan
  const staleIndicator = log?.indicator && !indicators.some((candidate) => candidate.id === log.indicator?.id) ? log.indicator : null;
  const existingPhoto = log?.photo && !removeExisting && !photo ? log : null;
  const busy = submitting || processingPhoto;

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function reset() {
    setKind(initialKind(indicators, log));
    setQuantity(log?.quantity?.replace(".", ",") ?? "");
    setNote(log?.note ?? "");
    setPhoto(null);
    setRemoveExisting(false);
    setFieldErrors({});
    setFormError(null);
  }

  function close() {
    reset();
    onClose();
  }

  async function selectPhoto(selected: File) {
    setFieldErrors((errors) => ({ ...errors, photo: undefined }));
    if (!selected.type.startsWith("image/")) {
      setFieldErrors((errors) => ({ ...errors, photo: "Foto harus berupa gambar JPG, PNG, atau WebP" }));
      return;
    }
    setProcessingPhoto(true);
    const shrunk = await shrinkPhoto(selected);
    setProcessingPhoto(false);
    if (shrunk.size > TASK_PHOTO_MAX_BYTES) {
      setFieldErrors((errors) => ({ ...errors, photo: "Foto terlalu besar (maks. 5 MB)" }));
      return;
    }
    setPhoto(shrunk);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const indicatorId = kind === OTHER ? null : kind;
    const normalized = indicatorId ? normalizeQuantityInput(quantity) : "";
    const parsed = taskLogInputSchema.safeParse({ workDate, indicatorId, quantity: normalized, note });
    const errors: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "quantity" || field === "note" || field === "indicatorId") && !errors[field]) errors[field] = issue.message;
      }
    } else if (indicator?.type === "count" && parsed.data.quantity && !/^[0-9]+$/.test(parsed.data.quantity)) {
      errors.quantity = "Realisasi berupa bilangan bulat";
    }
    if (Object.keys(errors).length > 0 || !parsed.success) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const formData = new FormData();
    formData.set("indicatorId", parsed.data.indicatorId ?? "");
    formData.set("quantity", parsed.data.quantity ?? "");
    formData.set("note", parsed.data.note ?? "");
    if (photo) formData.set("photo", photo, photo.name);

    setSubmitting(true);
    try {
      let outcome;
      if (log) {
        formData.set("removePhoto", removeExisting ? "true" : "false");
        outcome = await updateTaskLog(log.id, formData);
      } else {
        formData.set("workDate", workDate);
        outcome = await submitTaskLog(formData);
      }
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
    <Dialog open={open} onClose={close} dismissible={!busy} title={log ? "Ubah catatan tugas" : "Catat tugas"} description={longDate(workDate)}>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4.5">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <SelectField
          id="task-kind"
          label="Yang dikerjakan"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value);
            setFieldErrors({});
          }}
          error={fieldErrors.indicatorId}
          disabled={busy}
          hint={indicators.length === 0 ? "Jabatan Anda belum punya template KPI — catat sebagai pekerjaan lain." : undefined}
        >
          {indicators.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
          {staleIndicator ? <option value={staleIndicator.id}>{staleIndicator.name}</option> : null}
          <option value={OTHER}>Pekerjaan lain (di luar indikator)</option>
        </SelectField>

        {kind !== OTHER ? (
          <TextField
            id="task-quantity"
            label={`Realisasi${indicator ? ` (${indicator.unit})` : staleIndicator ? ` (${staleIndicator.unit})` : ""}`}
            inputMode={indicator?.type === "count" ? "numeric" : "decimal"}
            autoComplete="off"
            placeholder={indicator?.type === "count" ? "Mis. 40" : "Mis. 1250000"}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            error={fieldErrors.quantity}
            hint={indicator ? `${targetLabel(indicator.target, indicator.unit, indicator.targetPeriod)}. Boleh dicatat beberapa kali — dijumlahkan per hari.` : undefined}
            disabled={busy}
          />
        ) : null}

        <TextAreaField
          id="task-note"
          label={kind === OTHER ? "Pekerjaan yang dilakukan" : "Catatan (opsional)"}
          placeholder={kind === OTHER ? "Mis. membersihkan mesin espresso & menata ulang rak gelas" : "Mis. ramai karena ada pesanan kantor"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          error={fieldErrors.note}
          disabled={busy}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-text-primary">
            Foto bukti <span className="font-normal text-text-tertiary">(opsional)</span>
          </span>
          {photo && preview ? (
            <TaskPhotoRow src={preview} title={photo.name} caption={formatFileSize(photo.size)} onRemove={() => setPhoto(null)} disabled={busy} />
          ) : existingPhoto?.photo ? (
            <TaskPhotoRow
              src={myTaskPhotoHref(existingPhoto.id, existingPhoto.updatedAt)}
              title="Foto tersimpan"
              caption={formatFileSize(existingPhoto.photo.size)}
              onRemove={() => setRemoveExisting(true)}
              disabled={busy}
            />
          ) : (
            <FileDropzone
              id="task-photo"
              accept={TASK_PHOTO_ACCEPT}
              hint="JPG, PNG, atau WebP · foto diperkecil otomatis"
              onSelect={(file) => void selectPhoto(file)}
              loading={processingPhoto}
              loadingLabel="Menyiapkan foto…"
              disabled={submitting}
              error={fieldErrors.photo}
            />
          )}
        </div>

        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" loading={submitting} disabled={processingPhoto}>
            {submitting ? "Menyimpan…" : log ? "Simpan perubahan" : "Simpan catatan"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
