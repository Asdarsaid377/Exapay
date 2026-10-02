"use client";

import { type WorkShift, workShiftInputSchema } from "@exapay/shared";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { saveWorkShift } from "@/actions/shiftRoster";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextField } from "@/components/common/TextField";
import { shiftDurationNote } from "@/lib/shiftLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  // null = shift baru
  shift: WorkShift | null;
};

type FieldErrors = Partial<Record<"name" | "time", string>>;

// Tambah/ubah shift (design settings-attendance-shifts "ShiftDialog"): nama + jam mulai/selesai (input time), keterangan
// +1 hari & durasi otomatis. Mobile = sheet (Dialog). Dipasang ulang tiap dibuka (isian bersih).
export function WorkShiftFormDialog({ open, onClose, shift }: Props) {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState(shift?.name ?? "");
  const [startTime, setStartTime] = useState(shift?.startTime ?? "");
  const [endTime, setEndTime] = useState(shift?.endTime ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const note = shiftDurationNote(startTime, endTime);
  const sameTime = startTime !== "" && startTime === endTime;

  async function submit() {
    setFormError(null);
    const parsed = workShiftInputSchema.safeParse({ name, startTime, endTime });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === "name" ? "name" : "time";
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const outcome = await saveWorkShift(shift?.id ?? null, parsed.data);
      if (outcome.kind === "error") {
        if (outcome.field === "name") setErrors({ name: outcome.message });
        else setFormError(outcome.message);
        return;
      }
      onClose();
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
      onClose={onClose}
      dismissible={!submitting}
      title={shift ? `Ubah shift ${shift.name}` : "Tambah shift"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={submit} loading={submitting}>
            {submitting ? "Menyimpan…" : "Simpan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField
          id={`${id}-name`}
          label="Nama shift"
          requiredMark
          placeholder="mis. Pagi"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={submitting}
          maxLength={40}
          autoComplete="off"
        />
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <TextField
              id={`${id}-start`}
              label="Jam mulai"
              requiredMark
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              aria-invalid={errors.time || sameTime ? true : undefined}
              className="tabular-nums"
              disabled={submitting}
            />
            <TextField
              id={`${id}-end`}
              label="Jam selesai"
              requiredMark
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-invalid={errors.time || sameTime ? true : undefined}
              className="tabular-nums"
              disabled={submitting}
            />
          </div>
          {errors.time || sameTime ? (
            <p className="text-caption text-danger-text">{sameTime ? "Jam mulai dan selesai tidak boleh sama" : errors.time}</p>
          ) : note ? (
            <p className={`flex items-center gap-2 text-[13.5px] tabular-nums ${note.overnight ? "text-info-text" : "text-text-secondary"}`}>
              {note.overnight ? <Info aria-hidden className="size-4 shrink-0 text-info" /> : null}
              {note.text}
            </p>
          ) : null}
        </div>
        {shift ? <p className="text-caption text-text-tertiary">Perubahan jam berlaku untuk roster yang belum terkunci.</p> : null}
      </div>
    </Dialog>
  );
}
