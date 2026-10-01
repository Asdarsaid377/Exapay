import { salaryComponents } from "@exapay/db";
import type { PayrollComponentKind } from "@exapay/shared";

import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";

// Komponen gaji bawaan (feature 28) — disalin ke setiap usaha baru lewat seedTenantDefaults. Usaha yang sudah ada saat
// feature 28 dirilis diisi migration 0023 dengan daftar yang sama (jaga tetap sama). Setelah disalin, komponen milik
// usaha: boleh diubah nama/jenisnya, diarsipkan, atau dihapus (kecuali gaji pokok).
export const SALARY_BUILTIN_COMPONENTS: readonly { key: string; name: string; kind: PayrollComponentKind }[] = [
  { key: "base_salary", name: "Gaji Pokok", kind: "base_salary" },
  { key: "position_allowance", name: "Tunjangan Jabatan", kind: "fixed_allowance" },
  { key: "meal_allowance", name: "Uang Makan", kind: "variable_allowance" },
  { key: "transport_allowance", name: "Uang Transport", kind: "variable_allowance" },
  { key: "attendance_allowance", name: "Tunjangan Kehadiran", kind: "attendance_allowance" },
  { key: "incentive", name: "Insentif", kind: "variable_allowance" },
  { key: "thr", name: "THR", kind: "variable_allowance" },
  { key: "loan_installment", name: "Cicilan Pinjaman", kind: "deduction" },
];

export async function seedBuiltinSalaryComponents(tx: Transaction, ctx: TenantContext): Promise<void> {
  await tx
    .insert(salaryComponents)
    .values(SALARY_BUILTIN_COMPONENTS.map((component, index) => ({ tenantId: ctx.tenantId, name: component.name, kind: component.kind, sortOrder: index + 1, builtinKey: component.key })))
    .onConflictDoNothing();
}
