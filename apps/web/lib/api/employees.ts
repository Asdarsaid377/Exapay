import {
  type EmployeeDetail,
  employeeDetailSchema,
  type EmployeeFormOptions,
  employeeFormOptionsSchema,
  type EmployeeList,
  type EmployeeListQuery,
  employeeListSchema,
  type MyProfile,
  myProfileSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";
import { cache } from "react";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Data karyawan untuk Server Component (/employees)

async function cookieHeader() {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchEmployees(query: EmployeeListQuery): Promise<ApiResult<EmployeeList>> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.departmentId) params.set("departmentId", query.departmentId);
  if (query.status) params.set("status", query.status);
  params.set("activity", query.activity);
  params.set("page", String(query.page));
  return apiRequest(`/employees?${params.toString()}`, (data) => employeeListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchEmployee(id: string): Promise<ApiResult<EmployeeDetail>> {
  return apiRequest(`/employees/${encodeURIComponent(id)}`, (data) => employeeDetailSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// excludeId: karyawan yang sedang diubah (tidak ditawarkan sebagai atasannya sendiri)
export async function fetchEmployeeFormOptions(excludeId?: string): Promise<ApiResult<EmployeeFormOptions>> {
  const query = excludeId ? `?excludeId=${encodeURIComponent(excludeId)}` : "";
  return apiRequest(`/employees/options${query}`, (data) => employeeFormOptionsSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// Profil milik sendiri (portal /me/profile, feature 37). Di-cache per request: layout portal (menu karyawan nonaktif) +
// halaman memanggilnya bersamaan.
export const fetchMyProfile = cache(async (): Promise<ApiResult<MyProfile>> => {
  return apiRequest("/employees/me", (data) => myProfileSchema.parse(data), { cookieHeader: await cookieHeader() });
});
