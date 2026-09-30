"use client";

import { WEEKDAY_LABELS, type WorkSchedule, type WorkScheduleDay, workScheduleInputSchema } from "@exapay/shared";
import { type FormEvent, useState } from "react";

import { saveWorkSchedule } from "@/actions/workCalendar";
import { Button } from "@/components/common/Button";
import { FormAlert } from "@/components/common/FormAlert";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { TextField } from "@/components/common/TextField";
import { formatDateTime } from "@/lib/datetime";

type Props = {
  schedule: WorkSchedule;
};

type DayMode = "work" | "off";

const MODE_OPTIONS = [
  { value: "work", label: "Kerja" },
  { value: "off", label: "Libur" },
] as const;

// Jadwal kerja default 7 hari: Kerja/Libur + jam masuk & pulang. Jam hari libur tetap tersimpan (dinonaktifkan).
export function WorkScheduleForm({ schedule }: Props) {
  const [days, setDays] = useState<WorkScheduleDay[]>(schedule.days);
  const [updatedAt, setUpdatedAt] = useState(schedule.updatedAt);
  const [dayErrors, setDayErrors] = useState<Partial<Record<number, string>>>({});
  const [status, setStatus] = useState<{ tone: "success" | "danger"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const workdayCount = days.filter((day) => day.isWorkday).length;

  function update(weekday: number, patch: Partial<WorkScheduleDay>) {
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
    setDayErrors((current) => ({ ...current, [weekday]: undefined }));
    setStatus(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const parsed = workScheduleInputSchema.safeParse({ days });
    if (!parsed.success) {
      const errors: Partial<Record<number, string>> = {};
      let general: string | null = null;
      for (const issue of parsed.error.issues) {
        // path: ["days", index, field] untuk kesalahan per hari
        const index = issue.path[1];
        const day = typeof index === "number" ? days[index] : undefined;
        if (day && !errors[day.weekday]) errors[day.weekday] = issue.message;
        else if (!day && !general) general = issue.message;
      }
      setDayErrors(errors);
      if (general) setStatus({ tone: "danger", message: general });
      return;
    }
    setDayErrors({});

    setSubmitting(true);
    try {
      const outcome = await saveWorkSchedule(parsed.data);
      if (outcome.kind === "error") {
        setStatus({ tone: "danger", message: outcome.message });
        return;
      }
      setDays(outcome.schedule.days);
      setUpdatedAt(outcome.schedule.updatedAt);
      setStatus({ tone: "success", message: "Jadwal kerja disimpan." });
    } catch {
      setStatus({ tone: "danger", message: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col">
      <div className="hidden grid-cols-[96px_auto_minmax(0,1fr)_minmax(0,1fr)] gap-4 pb-2 text-caption font-bold text-text-secondary lg:grid">
        <span>Hari</span>
        <span className="w-37.5">Status</span>
        <span>Jam masuk</span>
        <span>Jam pulang</span>
      </div>
      <ul>
        {days.map((day) => {
          const label = WEEKDAY_LABELS[day.weekday];
          const off = !day.isWorkday;
          const error = dayErrors[day.weekday];
          return (
            <li key={day.weekday} className="flex flex-col gap-1.5 border-t border-border-subtle py-3 first:border-t-0 first:pt-0 lg:first:pt-1">
              <div className="grid grid-cols-2 items-center gap-x-4 gap-y-3 lg:grid-cols-[96px_auto_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
                <span className={`self-center text-[15px] font-bold ${off ? "text-text-tertiary" : "text-text-primary"}`}>{label}</span>
                <div className="justify-self-end lg:justify-self-start lg:self-center">
                  <SegmentedControl<DayMode>
                    label={`Status hari ${label}`}
                    options={MODE_OPTIONS}
                    value={off ? "off" : "work"}
                    onChange={(mode) => update(day.weekday, { isWorkday: mode === "work" })}
                    disabled={submitting}
                  />
                </div>
                <TextField
                  id={`schedule-${day.weekday}-start`}
                  label={`Jam masuk ${label}`}
                  labelClassName="lg:sr-only"
                  type="time"
                  step={60}
                  value={day.startTime}
                  onChange={(e) => update(day.weekday, { startTime: e.target.value })}
                  disabled={submitting || off}
                  className="tabular-nums"
                />
                <TextField
                  id={`schedule-${day.weekday}-end`}
                  label={`Jam pulang ${label}`}
                  labelClassName="lg:sr-only"
                  type="time"
                  step={60}
                  value={day.endTime}
                  onChange={(e) => update(day.weekday, { endTime: e.target.value })}
                  disabled={submitting || off}
                  className="tabular-nums"
                />
              </div>
              {error ? (
                <p role="alert" className="text-caption text-danger-text lg:pl-28">
                  {error}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-col gap-4 border-t border-border-subtle pt-5">
        {status ? <FormAlert tone={status.tone}>{status.message}</FormAlert> : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-caption text-text-tertiary">
            <span className="font-bold text-text-secondary tabular-nums">{workdayCount} hari kerja</span> per minggu
            {updatedAt ? ` · Terakhir diubah ${formatDateTime(updatedAt)}` : null}
          </p>
          <Button type="submit" loading={submitting}>
            {submitting ? "Menyimpan…" : "Simpan jadwal"}
          </Button>
        </div>
      </div>
    </form>
  );
}
