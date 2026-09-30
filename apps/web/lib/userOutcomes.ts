// Hasil Server Action pengelolaan pengguna (/settings/users) yang dikonsumsi component (client). Pesan error sudah human-readable.
export type UserActionOutcome = { kind: "error"; message: string } | { kind: "success" };
