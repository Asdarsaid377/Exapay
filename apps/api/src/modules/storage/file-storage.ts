// Abstraksi penyimpanan file privat (lampiran izin, foto tugas, slip PDF). Implementasi saat ini S3-compatible
// (SeaweedFS self-hosted); provider lain cukup mengimplementasikan kelas ini. Key selalu diawali `tenants/<tenant_id>/`.
// File tidak pernah diakses langsung dari browser — selalu lewat endpoint API yang memeriksa hak akses.
export abstract class FileStorage {
  abstract put(key: string, body: Buffer, contentType: string): Promise<void>;
  // File kecil (≤ beberapa MB) — dibaca utuh ke memori
  abstract get(key: string): Promise<Buffer>;
  abstract remove(key: string): Promise<void>;
}

// Key file milik tenant: tenants/<tenant_id>/<bagian>/…
export function tenantFileKey(tenantId: string, ...parts: string[]): string {
  return ["tenants", tenantId, ...parts].join("/");
}
