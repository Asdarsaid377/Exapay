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
