"use client";

import { parseCoordinates, WORK_LOCATION_RADIUS_DEFAULT, type WorkLocation, workLocationInputSchema } from "@exapay/shared";
import { CircleAlert, CircleCheck, Crosshair, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";

import { saveWorkLocation } from "@/actions/workLocations";
import { Button } from "@/components/common/Button";
import { Dialog } from "@/components/common/Dialog";
import { FormAlert } from "@/components/common/FormAlert";
import { TextField } from "@/components/common/TextField";
import { locateDevice } from "@/lib/geolocation";
import { formatAccuracy, formatCoordinates } from "@/lib/workLocationLabels";

type Props = {
  open: boolean;
  onClose: () => void;
  // Tanpa location = tambah lokasi baru
  location?: WorkLocation;
};

type Locate = { kind: "idle" } | { kind: "locating" } | { kind: "located"; accuracy: number | null } | { kind: "denied" } | { kind: "unavailable" };
type Field = "name" | "address" | "coordinates" | "radius";

// Akurasi di atas ini disarankan mengulang (design: ±12 m berhasil, ±85 m akurasi buruk)
const WEAK_ACCURACY_M = 50;
const COORDINATE_FORMAT_ERROR = "Format koordinat: lintang, bujur — contoh -5.15672, 119.43628";

function LocateHint({ locate }: { locate: Locate }): ReactNode {
  const row = "flex items-start gap-1.5";
  if (locate.kind === "located" && locate.accuracy !== null && locate.accuracy > WEAK_ACCURACY_M)
    return (
      <span className={`${row} text-warning-text`}>
        <TriangleAlert aria-hidden className="mt-px size-3.75 shrink-0 text-warning-icon" />
        Akurasi {formatAccuracy(locate.accuracy)} — coba lagi di luar ruangan atau dekat jendela
      </span>
    );
  if (locate.kind === "located")
    return (
      <span className={`${row} text-success-text`}>
        <CircleCheck aria-hidden className="mt-px size-3.75 shrink-0" />
        {locate.accuracy !== null ? `Akurasi ${formatAccuracy(locate.accuracy)}` : "Lokasi terbaca"}
      </span>
    );
  if (locate.kind === "denied")
    return (
      <span className={`${row} text-danger-text`}>
        <CircleAlert aria-hidden className="mt-px size-3.75 shrink-0" />
        Izin lokasi ditolak browser. Izinkan lokasi atau isi koordinat manual.
      </span>
    );
  if (locate.kind === "unavailable")
    return (
      <span className={`${row} text-danger-text`}>
        <CircleAlert aria-hidden className="mt-px size-3.75 shrink-0" />
        Lokasi tidak terbaca. Coba lagi atau isi koordinat manual.
      </span>
    );
  return "Bisa ditempel dari aplikasi peta";
}

// Tambah / ubah lokasi kerja (design settings-locations "Dialog Tambah/Ubah lokasi", komponen CoordinateField + LocateButton
// + UnitNumberField). Koordinat satu field "lintang, bujur"; tanpa peta pihak ketiga. Mobile: sheet dari bawah (Dialog).
export function WorkLocationFormDialog({ open, onClose, location }: Props) {
  const router = useRouter();
  const idPrefix = useId();
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [coordinates, setCoordinates] = useState(location ? formatCoordinates(location.latitude, location.longitude) : "");
  const [radius, setRadius] = useState(String(location?.radiusM ?? WORK_LOCATION_RADIUS_DEFAULT));
  const [locate, setLocate] = useState<Locate>({ kind: "idle" });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function useMyLocation() {
    setLocate({ kind: "locating" });
    const result = await locateDevice();
    if (result.kind !== "ok") {
      setLocate(result);
      return;
    }
    setCoordinates(formatCoordinates(result.latitude, result.longitude));
    setErrors((current) => ({ ...current, coordinates: undefined }));
    setLocate({ kind: "located", accuracy: result.accuracy });
  }

  async function submit() {
    setFormError(null);
    const point = parseCoordinates(coordinates);
    const radiusM = /^\d+$/.test(radius.trim()) ? Number(radius.trim()) : Number.NaN;
    const parsed = workLocationInputSchema.safeParse({
      name,
      address,
      latitude: point?.latitude ?? 0,
      longitude: point?.longitude ?? 0,
      radiusM,
    });
    const next: Partial<Record<Field, string>> = {};
    if (!coordinates.trim()) next.coordinates = "Koordinat wajib diisi";
    else if (!point) next.coordinates = COORDINATE_FORMAT_ERROR;
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === "name" && !next.name) next.name = issue.message;
        if (key === "address" && !next.address) next.address = issue.message;
        if (key === "radiusM" && !next.radius) next.radius = Number.isNaN(radiusM) ? "Radius dalam meter bulat, 25–1.000" : issue.message;
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.success) return;

    setSaving(true);
    try {
      const outcome = await saveWorkLocation(location?.id ?? null, parsed.data);
      if (outcome.kind === "error") {
        setFormError(outcome.message);
        return;
      }
      onClose();
      router.refresh();
    } catch {
      setFormError("Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  const locating = locate.kind === "locating";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!saving}
      title={location ? "Ubah lokasi" : "Tambah lokasi"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={submit} loading={saving} className="sm:min-w-26">
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4.5">
        {formError ? <FormAlert tone="danger">{formError}</FormAlert> : null}
        <TextField
          id={`${idPrefix}-name`}
          label="Nama lokasi"
          requiredMark
          placeholder="mis. Kedai Pettarani"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={saving}
          maxLength={80}
        />
        <TextField
          id={`${idPrefix}-address`}
          label="Alamat / catatan"
          placeholder="Opsional, mis. Jl. A. P. Pettarani No. 18"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors.address}
          disabled={saving}
          maxLength={200}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <TextField
              id={`${idPrefix}-coordinates`}
              label="Koordinat"
              requiredMark
              inputMode="decimal"
              autoComplete="off"
              placeholder="-5.15672, 119.43628"
              className="tabular-nums"
              value={coordinates}
              onChange={(e) => {
                setCoordinates(e.target.value);
                setLocate({ kind: "idle" });
              }}
              error={errors.coordinates}
              hint={<LocateHint locate={locate} />}
              disabled={saving}
            />
          </div>
          <Button variant="secondary" className="h-11 sm:mt-6.5" onClick={useMyLocation} loading={locating} disabled={saving || locating}>
            {locating ? null : <Crosshair aria-hidden className="size-4" />}
            {locating ? "Mencari lokasi…" : "Pakai lokasi saya sekarang"}
          </Button>
        </div>
        <div className="sm:w-40">
          <TextField
            id={`${idPrefix}-radius`}
            label="Radius (meter)"
            requiredMark
            inputMode="numeric"
            className="tabular-nums"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            trailing={
              <span aria-hidden className="pr-2 text-body text-text-secondary">
                m
              </span>
            }
            error={errors.radius}
            disabled={saving}
          />
        </div>
        {errors.radius ? null : <p className="-mt-3 text-caption text-text-tertiary">Absen lebih jauh dari radius ini diberi tanda. Rentang 25–1.000 m.</p>}
      </div>
    </Dialog>
  );
}
