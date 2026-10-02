import type { AttendanceLocation, GeofenceStatus } from "@exapay/shared";

// Geofence peringatan (feature 44) — fungsi murni, tanpa DB. Absen tidak pernah ditolak; hasil ini hanya tanda untuk ditinjau.

export type GeofenceSite = { name: string; latitude: number; longitude: number; radiusM: number };

export type GeofenceCheck = { status: GeofenceStatus; distanceM: number | null; locationName: string | null };

// Jari-jari rata-rata bumi (IUGG), meter
const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

// Jarak lingkaran besar (haversine) antara dua titik, meter. Galat < 0,5% — jauh di bawah akurasi GPS HP.
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// null = tidak dicek (tanpa lokasi kerja yang berlaku untuk karyawan ini).
// Lokasi terdekat = jarak ke tepi radius terkecil (lokasi beradius besar bisa "lebih dekat" walau pusatnya lebih jauh).
// Urutan: akurasi > radius lokasi terdekat → inaccurate; jarak ≤ radius → inside; selain itu outside.
export function evaluateGeofence(location: AttendanceLocation | null, sites: readonly GeofenceSite[]): GeofenceCheck | null {
  if (sites.length === 0) return null;
  if (!location) return { status: "no_location", distanceM: null, locationName: null };

  let nearest: { site: GeofenceSite; distance: number } | null = null;
  for (const site of sites) {
    const distance = distanceMeters(location, site);
    if (!nearest || distance - site.radiusM < nearest.distance - nearest.site.radiusM) nearest = { site, distance };
  }
  if (!nearest) return null;

  const distanceM = Math.round(nearest.distance);
  const locationName = nearest.site.name;
  if (location.accuracy !== null && location.accuracy > nearest.site.radiusM) return { status: "inaccurate", distanceM, locationName };
  return { status: nearest.distance <= nearest.site.radiusM ? "inside" : "outside", distanceM, locationName };
}
