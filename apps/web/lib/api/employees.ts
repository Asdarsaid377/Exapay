import {
  type EmployeeDetail,
  employeeDetailSchema,
  type EmployeeFormOptions,
  employeeFormOptionsSchema,
  type EmployeeList,
  type EmployeeListQuery,
  employeeListSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";

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
