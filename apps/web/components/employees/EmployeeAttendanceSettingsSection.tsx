"use client";

import { type EmployeeAttendanceSettings, type EmployeeLocationMode, type EmployeeScheduleMode, employeeAttendanceSettingsInputSchema } from "@exapay/shared";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { updateEmployeeAttendanceSettings } from "@/actions/workLocations";
import { Button } from "@/components/common/Button";
import { Checkbox } from "@/components/common/Checkbox";
import { FormAlert } from "@/components/common/FormAlert";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { locationModeText } from "@/lib/workLocationLabels";

type Props = {
  employeeId: string;
  settings: EmployeeAttendanceSettings;
};

const SELFIE_OPTIONS = [
  { value: "required", label: "Wajib" },
  { value: "optional", label: "Tidak wajib" },
] as const;

const SCHEDULE_HINTS: Record<EmployeeScheduleMode, string> = {
  business: "Mengikuti jadwal kerja usaha di Pengaturan › Absensi.",
  shift: "Karyawan shift hanya dijadwalkan pada tanggal yang diisi di roster. Hari tanpa shift dihitung libur.",
};

const SELFIE_HINT = "Foto hanya bukti kehadiran, disimpan 90 hari. Tanpa pengenalan wajah.";

const MODE_OPTIONS = [
  { value: "all", label: "Semua lokasi" },
  { value: "selected", label: "Lokasi tertentu" },
  { value: "exempt", label: "Dikecualikan" },
] as const;

// Section "Pengaturan absen" di tab Data detail karyawan (design employees-attendance-settings "AttendanceSettingsSection"):
// form-section 2 kolom, baris label | nilai yang nanti bertambah (Wajib selfie — feature 45, Mode jadwal — feature 46).
// Ubah di tempat (owner/admin); atasan hanya baca. Lokasi yang dipilih di-snapshot API saat absen.
// Baris "Mode jadwal" (feature 46): Ikut jadwal usaha | Shift (roster); shift nonaktif bila usaha belum punya master shift.
// Baris "Wajib selfie saat absen" (feature 45): segmented Wajib | Tidak wajib. Usaha tanpa lokasi kerja tetap bisa
// mengubah selfie — baris lokasi hanya menampilkan "Belum ada lokasi kerja".
export function EmployeeAttendanceSettingsSection({ employeeId, settings: initial }: Props) {
  const idPrefix = useId();
  const [settings, setSettings] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<EmployeeLocationMode>(initial.locationMode);
  const [selected, setSelected] = useState<string[]>(initial.locationIds);
  const [selfie, setSelfie] = useState<"required" | "optional">(initial.selfieRequired ? "required" : "optional");
  const [schedule, setSchedule] = useState<EmployeeScheduleMode>(initial.scheduleMode);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const noLocations = settings.locations.length === 0;
  const canEdit = settings.canEdit;

  function startEdit() {
    setMode(settings.locationMode);
    setSelected(settings.locationIds);
    setSelfie(settings.selfieRequired ? "required" : "optional");
    setSchedule(settings.scheduleMode);
    setSelectionError(null);
    setFormError(null);
    setEditing(true);
  }

  function toggle(id: string) {
    setSelectionError(null);
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  }

  async function save() {
    setFormError(null);
    const parsed = employeeAttendanceSettingsInputSchema.safeParse({
      locationMode: mode,
      locationIds: mode === "selected" ? selected : [],
      selfieRequired: selfie === "required",
      scheduleMode: schedule,
    });
    if (!parsed.success) {
      setSelectionError(parsed.error.issues[0]?.message ?? "Pilih minimal satu lokasi");
      return;
    }
    setSaving(true);
    try {
      const outcome = await updateEmployeeAttendanceSettings(employeeId, parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      setSettings(outcome.settings);
      setEditing(false);
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const editButton = canEdit && !editing ? (
    <Button variant="secondary" className="h-9 px-3.5 text-[13px]" onClick={startEdit} aria-label="Ubah pengaturan absen">
      <Pencil aria-hidden className="size-3.75" />
      Ubah
    </Button>
  ) : null;

  return (
    <section
      className={`glass-strong grid gap-4 rounded-card p-4.5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10 lg:p-7 ${editing ? "outline outline-1 -outline-offset-1 outline-accent/45" : ""}`}
      aria-labelledby={`${idPrefix}-title`}
    >
      <div className="flex flex-col gap-2.5">
        <div className="flex min-h-9 items-center justify-between gap-3 lg:block lg:min-h-0">
          <h2 id={`${idPrefix}-title`} className="font-display text-base font-bold tracking-[-0.01em] text-text-primary lg:text-[17px]">
            Pengaturan absen
          </h2>
          {editButton ? <div className="lg:hidden">{editButton}</div> : null}
        </div>
        <p className="hidden text-sm text-pretty text-text-secondary lg:block">Berlaku untuk absen dari portal karyawan.</p>
        {editButton ? <div className="hidden lg:block">{editButton}</div> : null}
      </div>

      {editing ? (
        <div className="flex min-w-0 flex-col gap-5">
          {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
          <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
            <span id={`${idPrefix}-mode`} className="text-[13px] font-bold text-text-primary lg:pt-2.5">
              Lokasi absen
            </span>
            {noLocations ? (
              <div className="flex flex-col items-start gap-1 lg:pt-2.5">
                <span className="text-[15px] font-medium text-text-primary">Belum ada lokasi kerja</span>
                <Link href="/settings/locations" className="text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline">
                  Atur lokasi kerja
                </Link>
              </div>
            ) : (
            <div className="flex min-w-0 flex-col items-start gap-3">
              <div className="w-full max-sm:overflow-x-auto sm:w-auto">
                <SegmentedControl label="Lokasi absen" options={MODE_OPTIONS} value={mode} onChange={setMode} disabled={saving} />
              </div>
              {mode === "all" ? (
                <p className="text-[13.5px] text-text-secondary">Dicek di {settings.locations.map((l) => l.name).join(" dan ")}.</p>
              ) : mode === "selected" ? (
                <div className="flex w-full flex-col gap-0.5">
                  {settings.locations.map((location) => (
                    <label
                      key={location.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-inner px-1 transition-colors hover:bg-row-hover"
                    >
                      <Checkbox
                        checked={selected.includes(location.id)}
                        onChange={() => toggle(location.id)}
                        disabled={saving}
                        aria-invalid={selectionError ? true : undefined}
                      />
                      <span className="flex min-w-0 flex-col gap-px">
                        <span className="text-[15px] font-medium text-text-primary">{location.name}</span>
                        <span className="text-caption text-text-tertiary tabular-nums">Radius {location.radiusM.toLocaleString("id-ID")} m</span>
                      </span>
                    </label>
                  ))}
                  {selectionError ? <p className="text-caption text-danger-text">{selectionError}</p> : null}
                </div>
              ) : (
                <p className="text-[13.5px] text-text-secondary">Cocok untuk karyawan lapangan seperti kurir atau sales. Absen dari mana saja tanpa tanda.</p>
              )}
            </div>
            )}
          </div>
          <div className="grid gap-3 border-t border-border-subtle pt-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
            <span className="text-[13px] font-bold text-text-primary lg:pt-2.5">Wajib selfie saat absen</span>
            <div className="flex min-w-0 flex-col items-start gap-2.5">
              <div className="w-full sm:w-auto">
                <SegmentedControl label="Wajib selfie saat absen" options={SELFIE_OPTIONS} value={selfie} onChange={setSelfie} disabled={saving} fullWidth />
              </div>
              <p className="text-[13.5px] text-pretty text-text-secondary">{SELFIE_HINT}</p>
            </div>
          </div>
          <div className="grid gap-3 border-t border-border-subtle pt-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
            <span className="text-[13px] font-bold text-text-primary lg:pt-2.5">Mode jadwal</span>
            <div className="flex min-w-0 flex-col items-start gap-2.5">
              <div className="w-full sm:w-auto">
                <SegmentedControl
                  label="Mode jadwal"
                  options={[
                    { value: "business", label: "Ikut jadwal usaha" },
                    // Belum ada master shift → mode shift tidak bisa dipilih (kecuali karyawan ini sudah mode shift)
                    { value: "shift", label: "Shift (roster)", disabled: !settings.hasShifts && settings.scheduleMode !== "shift" },
                  ]}
                  value={schedule}
                  onChange={setSchedule}
                  disabled={saving}
                  fullWidth
                />
              </div>
              {!settings.hasShifts && settings.scheduleMode !== "shift" ? (
                <p className="text-[13.5px] text-pretty text-text-secondary">
                  Belum ada shift.{" "}
                  <Link href="/settings/attendance" className="font-bold text-accent-strong hover:text-accent-hover hover:underline">
                    Buat shift dulu di Pengaturan › Absensi
                  </Link>
                </p>
              ) : (
                <p className="text-[13.5px] text-pretty text-text-secondary">{SCHEDULE_HINTS[schedule]}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 border-t border-border-subtle pt-4 sm:flex sm:justify-end">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              Batal
            </Button>
            <Button onClick={save} loading={saving}>
              {saving ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      ) : (
        <dl className="flex min-w-0 flex-col max-lg:border-t max-lg:border-border-subtle max-lg:pt-2.5">
          <div className="grid gap-1 py-1 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
            <dt className="text-[13px] text-text-tertiary lg:pt-0.5">Lokasi absen</dt>
            <dd className="flex flex-col items-start gap-1">
              <span className="text-[15px] font-medium text-text-primary">{noLocations ? "Belum ada lokasi kerja" : locationModeText(settings)}</span>
              {noLocations ? <span className="text-[13.5px] text-text-secondary">Absen tidak dicek lokasinya.</span> : null}
              {noLocations && settings.canEdit ? (
                <Link href="/settings/locations" className="text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline">
                  Atur lokasi kerja
                </Link>
              ) : null}
            </dd>
          </div>
          <div className="mt-2 grid gap-1 border-t border-border-subtle pt-3 pb-1 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
            <dt className="text-[13px] text-text-tertiary lg:pt-0.5">Wajib selfie saat absen</dt>
            <dd className="text-[15px] font-medium text-text-primary">{settings.selfieRequired ? "Ya — absen masuk & pulang memakai selfie" : "Tidak"}</dd>
          </div>
          <div className="mt-2 grid gap-1 border-t border-border-subtle pt-3 pb-1 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-6">
            <dt className="text-[13px] text-text-tertiary lg:pt-0.5">Mode jadwal</dt>
            <dd className="flex flex-col items-start gap-1">
              <span className="text-[15px] font-medium text-text-primary">{settings.scheduleMode === "shift" ? "Shift (roster)" : "Ikut jadwal usaha"}</span>
              {settings.scheduleMode === "shift" ? (
                <Link href="/attendance/roster" className="text-sm font-bold text-accent-strong hover:text-accent-hover hover:underline">
                  Lihat roster
                </Link>
              ) : null}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
