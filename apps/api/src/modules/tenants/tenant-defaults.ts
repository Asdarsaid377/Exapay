import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";
import { seedDefaultWorkSchedule } from "../attendance/work-calendar.service.js";
import { seedBuiltinKpiTemplates } from "../kpi/kpi-builtin-templates.js";
import { seedBuiltinSalaryComponents } from "../payroll/salary-builtin-components.js";

// Data bawaan untuk tenant baru, dijalankan di transaksi yang sama dengan pembuatan tenant
// (signup owner — feature 05; tenant buatan super-admin — feature 07).
// Diisi bertahap oleh feature terkait —
//   13 jadwal kerja default (ada), 18 template KPI bawaan (ada), 22 siklus penilaian (bulanan, default kolom), 28 komponen gaji bawaan (ada).
// Data regulasi (BPJS, TER, PTKP, UMK — feature 24) dan libur nasional (feature 13) bersifat global, bukan disalin per tenant.
export async function seedTenantDefaults(tx: Transaction, ctx: TenantContext): Promise<void> {
  await seedDefaultWorkSchedule(tx, ctx);
  await seedBuiltinKpiTemplates(tx, ctx);
  await seedBuiltinSalaryComponents(tx, ctx);
}
