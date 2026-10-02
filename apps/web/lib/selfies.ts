import type { AttendanceEvent } from "@exapay/shared";

// URL foto selfie lewat Route Handler web: portal (milik sendiri) atau area staf (rincian absensi & tinjauan)
export type SelfieScope = "portal" | "staff";

export function selfieSrc(scope: SelfieScope, recordId: string, event: AttendanceEvent): string {
  const base = scope === "portal" ? "/me/attendance/selfies" : "/attendance/selfies";
  return `${base}/${recordId}/${event}`;
}

export const SELFIE_EVENT_LABELS: Record<AttendanceEvent, string> = { check_in: "Masuk", check_out: "Pulang" };

// Pemberitahuan selfie pertama kali diingat per perangkat (localStorage — kenyamanan, bukan persetujuan yang disimpan)
export const SELFIE_CONSENT_STORAGE_KEY = "exapay:selfie-consent:v1";

// Kompres foto kamera di HP: sisi terpanjang ≤ 720 px, JPEG, kualitas diturunkan sampai ±100 KB
const MAX_EDGE = 720;
const TARGET_BYTES = 110 * 1024;

export async function compressSelfie(source: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, MAX_EDGE / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas tidak tersedia");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  let blob: Blob | null = null;
  for (const quality of [0.8, 0.7, 0.6, 0.5, 0.4]) {
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= TARGET_BYTES) return blob;
  }
  if (!blob) throw new Error("foto gagal dikompres");
  return blob;
}
