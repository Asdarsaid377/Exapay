// Bentuk response standar semua endpoint API (lihat code-standards.md)
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: ApiErrorCode; data?: T };

// Kode error mesin untuk kasus yang perlu ditangani client secara khusus (status HTTP saja tidak cukup).
// Pesan `error` tetap human-readable untuk ditampilkan.
export const API_ERROR_CODES = ["EMAIL_UNVERIFIED", "TENANT_DEACTIVATED"] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
