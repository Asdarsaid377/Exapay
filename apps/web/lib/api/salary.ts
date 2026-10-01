import { type EmployeeSalaryOverview, employeeSalaryOverviewSchema, type SalaryComponentSettings, salaryComponentSettingsSchema } from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Komponen gaji (feature 28) untuk Server Component /settings/salary-components & /employees/[id]

export async function fetchSalaryComponentSettings(): Promise<ApiResult<SalaryComponentSettings>> {
  const store = await cookies();
  return apiRequest("/salary-components", (data) => salaryComponentSettingsSchema.parse(data), {
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
}

export async function fetchEmployeeSalary(employeeId: string): Promise<ApiResult<EmployeeSalaryOverview>> {
  const store = await cookies();
  return apiRequest(`/employees/${employeeId}/salary`, (data) => employeeSalaryOverviewSchema.parse(data), {
    cookieHeader: sessionCookieHeader((name) => store.get(name)?.value),
  });
}
