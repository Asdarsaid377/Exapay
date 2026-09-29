// Bentuk response standar semua endpoint API (lihat code-standards.md)
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; data?: T };
