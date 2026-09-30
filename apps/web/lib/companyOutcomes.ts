import type { CompanyProfile } from "@exapay/shared";

// Hasil Server Action profil usaha yang dikonsumsi component (client). Pesan error sudah human-readable.
export type SaveCompanyProfileOutcome = { kind: "error"; message: string } | { kind: "success"; profile: CompanyProfile };
