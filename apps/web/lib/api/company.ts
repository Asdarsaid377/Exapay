import { type CompanyProfile, companyProfileSchema, type RegionProvince, regionProvincesSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Profil usaha & referensi wilayah untuk Server Component (/settings/company)

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchCompanyProfile(): Promise<ApiResult<CompanyProfile>> {
  return apiRequest("/company", (data) => companyProfileSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchRegions(): Promise<ApiResult<RegionProvince[]>> {
  return apiRequest("/regions", (data) => regionProvincesSchema.parse(data), { cookieHeader: await cookieHeader() });
}
