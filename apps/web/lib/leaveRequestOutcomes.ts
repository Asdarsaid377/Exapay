// Hasil Server Action pengajuan izin untuk Client Component. Pesan error sudah human-readable.
export type LeaveActionOutcome = { kind: "error"; message: string } | { kind: "success" };
