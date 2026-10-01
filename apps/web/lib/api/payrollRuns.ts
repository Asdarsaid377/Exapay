import {
  type PayrollEmployeeDetail,
  payrollEmployeeDetailSchema,
  type PayrollRunDetail,
  payrollRunDetailSchema,
  type PayrollRunList,
  payrollRunListSchema,
} from "@exapay/shared";
import { cookies } from "next/headers";

import { type ApiResult, apiRequest, sessionCookieHeader } from "@/lib/api/server";

// Run payroll — draf & review (feature 29): /payroll, /payroll/[id], /payroll/[id]/employees/[employeeId]

async function cookieHeader(): Promise<string | undefined> {
  const store = await cookies();
  return sessionCookieHeader((name) => store.get(name)?.value);
}

export async function fetchPayrollRuns(): Promise<ApiResult<PayrollRunList>> {
  return apiRequest("/payroll/runs", (data) => payrollRunListSchema.parse(data), { cookieHeader: await cookieHeader() });
}

// id sudah divalidasi (uuid)
export async function fetchPayrollRun(id: string): Promise<ApiResult<PayrollRunDetail>> {
  return apiRequest(`/payroll/runs/${id}`, (data) => payrollRunDetailSchema.parse(data), { cookieHeader: await cookieHeader() });
}

export async function fetchPayrollEmployee(runId: string, employeeId: string): Promise<ApiResult<PayrollEmployeeDetail>> {
  return apiRequest(`/payroll/runs/${runId}/employees/${employeeId}`, (data) => payrollEmployeeDetailSchema.parse(data), {
    cookieHeader: await cookieHeader(),
  });
}
