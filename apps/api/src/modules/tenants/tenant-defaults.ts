import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";

// Data bawaan untuk tenant baru, dijalankan di transaksi yang sama dengan pembuatan tenant
// (signup owner — feature 05; tenant buatan super-admin — feature 07).
// Placeholder: diisi oleh feature terkait —
//   13 jadwal kerja default, 18 template KPI bawaan, 22 siklus penilaian (bulanan), 28 komponen gaji bawaan.
// Data regulasi (BPJS, TER, PTKP, UMK — feature 24) bersifat global berlaku-tanggal, bukan disalin per tenant.
export async function seedTenantDefaults(_tx: Transaction, _ctx: TenantContext): Promise<void> {
  // Belum ada data bawaan per tenant.
}
