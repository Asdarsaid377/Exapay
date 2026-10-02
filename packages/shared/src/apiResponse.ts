// Bentuk response standar semua endpoint API (lihat code-standards.md)
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: ApiErrorCode; data?: T };

// Kode error mesin untuk kasus yang perlu ditangani client secara khusus (status HTTP saja tidak cukup).
// Pesan `error` tetap human-readable untuk ditampilkan.
// SUBSCRIPTION_READ_ONLY (HTTP 402): trial/langganan berakhir + masa tenggang lewat → usaha mode baca-saja (feature 39)
export const API_ERROR_CODES = ["EMAIL_UNVERIFIED", "TENANT_DEACTIVATED", "SUBSCRIPTION_READ_ONLY"] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
