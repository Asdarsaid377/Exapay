"use server";

import { companyProfileSchema, type UpdateCompanyProfileInput, updateCompanyProfileSchema } from "@exapay/shared";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { apiRequest, sessionCookieHeader } from "@/lib/api/server";
import type { SaveCompanyProfileOutcome } from "@/lib/companyOutcomes";

// Server Action tipis /settings/company: validasi ulang → PUT /company → revalidate. Peran dicek di API.
export async function saveCompanyProfile(input: UpdateCompanyProfileInput): Promise<SaveCompanyProfileOutcome> {
  const parsed = updateCompanyProfileSchema.safeParse(input);
  if (!parsed.success) return { kind: "error", message: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const store = await cookies();
  const result = await apiRequest("/company", (data) => companyProfileSchema.parse(data), {
    method: "PUT",
    body: parsed.data,
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
  if (!result.ok) return { kind: "error", message: result.error };
  // Nama usaha tampil di header (tenant switcher) semua halaman
  revalidatePath("/", "layout");
  return { kind: "success", profile: result.data };
}
