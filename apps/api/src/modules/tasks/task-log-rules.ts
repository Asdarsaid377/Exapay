import { TASK_LOG_BACKDATE_DAYS, type TaskLogStatus, type TaskPhotoType } from "@exapay/shared";

// Aturan log tugas harian (feature 19) — fungsi murni: tanggal string YYYY-MM-DD (dihitung UTC), "hari ini" dikirim sebagai input.

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// Tanggal paling awal yang masih boleh dicatat: hari ini − 7 hari, tidak sebelum tanggal masuk kerja
export function earliestLogDate(today: string, joinDate: string): string {
  const earliest = addDays(today, -TASK_LOG_BACKDATE_DAYS);
  return joinDate > earliest ? joinDate : earliest;
}

// to → from (terbaru dulu), inklusif
export function datesDescending(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = to; date >= from; date = addDays(date, -1)) dates.push(date);
  return dates;
}

// Catatan milik sendiri bisa diubah/dihapus selama menunggu verifikasi dan tanggalnya masih di jendela catat
export function isTaskLogEditable(status: TaskLogStatus, workDate: string, minDate: string, today: string): boolean {
  return status === "pending" && workDate >= minDate && workDate <= today;
}

const PHOTO_SIGNATURES: readonly { type: TaskPhotoType; bytes: readonly (number | null)[] }[] = [
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // "RIFF" <ukuran 4 byte> "WEBP"
  { type: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
];

export const TASK_PHOTO_EXTENSIONS: Record<TaskPhotoType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Jenis foto dari isi file (magic bytes), bukan dari nama/Content-Type kiriman client
export function detectTaskPhotoType(buffer: Buffer): TaskPhotoType | null {
  const match = PHOTO_SIGNATURES.find((signature) => signature.bytes.every((byte, index) => byte === null || buffer[index] === byte));
  return match?.type ?? null;
}

// Realisasi indikator jumlah (count) harus bilangan bulat ("12", "12.0", "12.00")
export function isWholeQuantity(quantity: string): boolean {
  return /^[0-9]+(\.0{1,2})?$/.test(quantity);
}
