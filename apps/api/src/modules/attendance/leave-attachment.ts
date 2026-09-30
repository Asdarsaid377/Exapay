import type { LeaveAttachmentType } from "@exapay/shared";

// Lampiran pengajuan izin (feature 15) — fungsi murni: jenis file dari isi (magic bytes), bukan dari nama/Content-Type
// kiriman client, dan nama file yang aman ditampilkan/diunduh.

const SIGNATURES: readonly { type: LeaveAttachmentType; bytes: readonly number[] }[] = [
  // %PDF-
  { type: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { type: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { type: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

export const ATTACHMENT_EXTENSIONS: Record<LeaveAttachmentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function detectAttachmentType(buffer: Buffer): LeaveAttachmentType | null {
  const match = SIGNATURES.find((signature) => signature.bytes.every((byte, index) => buffer[index] === byte));
  return match?.type ?? null;
}

const NAME_MAX = 120;

// Multer membaca nama file multipart sebagai latin1 — nama UTF-8 (mis. "surat-dokter-é.pdf") dikembalikan jika valid
function decodeMultipartName(name: string): string {
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("�") ? name : decoded;
}

// Tanpa path & karakter kontrol, maks. 120 karakter, ekstensi mengikuti jenis file sebenarnya
export function safeAttachmentName(original: string, type: LeaveAttachmentType): string {
  const extension = ATTACHMENT_EXTENSIONS[type];
  const base = decodeMultipartName(original)
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\p{Cc}\p{Cf}"]/gu, "")
    .replace(/\.[^.]*$/, "")
    .trim();
  const stem = (base && base.length > 0 ? base : "lampiran").slice(0, NAME_MAX - extension.length - 1);
  return `${stem}.${extension}`;
}
