"use client";

import { attendanceCorrectionInputSchema, type AttendanceDay } from "@exapay/shared";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { correctAttendance } from "@/actions/attendanceCorrections";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextAreaField } from "@/components/common/TextAreaField";
import { TextField } from "@/components/common/TextField";
import { formatClockTime } from "@/lib/attendanceLabels";
import { formatIsoDate } from "@/lib/datetime";
import { weekdayLabelOf } from "@/lib/workCalendarLabels";

type Props = {
  employee: { id: string; fullName: string };
  day: AttendanceDay;
  // Label status hari itu (mis. "Alpa", "Telat 12 menit")
  statusLabel: string;
  timeZone: string;
};

type FieldErrors = Partial<Record<"checkIn" | "checkOut" | "reason", string>>;

// Koreksi jam masuk/pulang satu tanggal (owner/admin). Hari tanpa absen → absen dibuat. Alasan wajib (tercatat di riwayat & audit log).
export function CorrectAttendanceButton({ employee, day, statusLabel, timeZone }: Props) {
  const router = useRouter();
  const id = useId();
  const initialIn = day.record ? formatClockTime(day.record.checkInAt, timeZone) : "";
  const initialOut = day.record?.checkOutAt ? formatClockTime(day.record.checkOutAt, timeZone) : "";
  const [open, setOpen] = useState(false);
  const [checkIn, setCheckIn] = useState(initialIn);
  const [checkOut, setCheckOut] = useState(initialOut);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function openDialog() {
    setCheckIn(initialIn);
    setCheckOut(initialOut);
    setReason("");
    setErrors({});
    setFormError(null);
    setOpen(true);
  }

  async function submit() {
    setFormError(null);
    const parsed = attendanceCorrectionInputSchema.safeParse({
      employeeId: employee.id,
      workDate: day.date,
      checkIn: checkIn === "" ? undefined : checkIn,
      checkOut: checkOut === "" ? null : checkOut,
      reason,
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "checkIn" || key === "checkOut" || key === "reason") && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const outcome = await correctAttendance(parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const current = day.record
    ? `Sekarang: masuk ${initialIn} · ${day.record.checkOutAt ? `pulang ${initialOut}` : "tanpa absen pulang"}`
    : `Sekarang: belum ada absen (${statusLabel.toLowerCase()})`;

  return (
    <>
      <Button variant="secondary" onClick={openDialog} className="shrink-0">
        Koreksi
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!submitting}
        title="Koreksi absensi"
        description={`${employee.fullName} · ${weekdayLabelOf(day.date)}, ${formatIsoDate(day.date)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} loading={submitting}>
              {submitting ? "Menyimpan…" : "Simpan koreksi"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <p className="rounded-inner bg-fill-subtle px-3.5 py-3 text-sm text-text-primary tabular-nums">{current}</p>
          <div className="grid grid-cols-2 gap-4">
            <TextField
              id={`${id}-in`}
              type="time"
              label="Jam masuk"
              requiredMark
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              error={errors.checkIn}
              disabled={submitting}
            />
            <TextField
              id={`${id}-out`}
              type="time"
              label="Jam pulang"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
              error={errors.checkOut}
              hint="Kosongkan jika belum pulang"
              disabled={submitting}
            />
          </div>
          <TextAreaField
            id={`${id}-reason`}
            label="Alasan koreksi"
            placeholder="Mis. lupa absen pulang, sesuai buku tamu"
            hint="Tercatat di riwayat koreksi & audit log."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={errors.reason}
            disabled={submitting}
          />
        </div>
      </Dialog>
    </>
  );
}
