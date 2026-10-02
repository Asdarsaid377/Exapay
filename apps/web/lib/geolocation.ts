import type { AttendanceLocation } from "@exapay/shared";

// Lokasi saat absen (browser). Tidak pernah memblokir absen: izin ditolak, tidak didukung, atau terlalu lama → null.
// Dipanggil hanya dari Client Component (navigator).
export function currentLocation(timeoutMs = 8000): Promise<AttendanceLocation | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }),
      () => resolve(null),
      // Posisi ≤ 1 menit boleh dipakai ulang agar tombol tetap cepat di HP
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export type DeviceLocation = { kind: "ok"; latitude: number; longitude: number; accuracy: number | null } | { kind: "denied" } | { kind: "unavailable" };

// "Pakai lokasi saya sekarang" saat menyimpan lokasi kerja (feature 44): beda dengan absen, alasan gagal ditampilkan
// (izin ditolak vs. GPS tidak tersedia/terlalu lama). Posisi segar (maximumAge 0) — titik ini jadi acuan semua absen.
export function locateDevice(timeoutMs = 15000): Promise<DeviceLocation> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve({ kind: "unavailable" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          kind: "ok",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        }),
      (error) => resolve(error.code === error.PERMISSION_DENIED ? { kind: "denied" } : { kind: "unavailable" }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
