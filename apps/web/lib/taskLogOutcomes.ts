// Hasil Server Action log tugas untuk Client Component. Pesan error sudah human-readable.
export type TaskLogActionOutcome = { kind: "error"; message: string } | { kind: "success" };
