import { kpiIndicators, kpiTemplates } from "@exapay/db";
import { type KpiIndicatorInput, type KpiIndicatorType, KPI_RATING_SCALE_MAX, type KpiSystemMetric, type KpiTargetPeriod, KPI_WEIGHT_TOTAL } from "@exapay/shared";

import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";

// Template KPI bawaan (feature 18) — disalin ke setiap usaha baru lewat seedTenantDefaults, dan bisa ditambahkan
// kembali dari /kpi/templates bila terhapus. Setelah disalin, template milik usaha sepenuhnya (bisa diubah/dihapus).
// Perubahan isi di sini hanya berlaku untuk usaha baru / penambahan ulang — template yang sudah ada tidak disentuh.

type BuiltinTemplate = {
  key: string;
  name: string;
  description: string;
  indicators: readonly KpiIndicatorInput[];
};

const ATTENDANCE: KpiIndicatorInput = { name: "Kehadiran", type: "system", systemMetric: "attendance_rate", target: "95", weight: 20 };

export const BUILTIN_KPI_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    key: "sales",
    name: "Sales",
    description: "Tenaga penjual lapangan atau toko: nilai penjualan, kunjungan, dan pelanggan baru.",
    indicators: [
      { name: "Nilai penjualan", type: "numeric", unit: "Rp", target: "50000000", targetPeriod: "monthly", weight: 40 },
      { name: "Kunjungan pelanggan", type: "count", unit: "kunjungan", target: "5", targetPeriod: "daily", weight: 20 },
      { name: "Pelanggan baru", type: "count", unit: "pelanggan", target: "8", targetPeriod: "monthly", weight: 15 },
      { ...ATTENDANCE, weight: 15 },
      { name: "Sikap & kerja sama", type: "rating", weight: 10 },
    ],
  },
  {
    key: "kasir",
    name: "Kasir",
    description: "Kasir toko, kafe, atau rumah makan: transaksi dilayani, tutup kas rapi, dan pelayanan.",
    indicators: [
      { name: "Transaksi dilayani", type: "count", unit: "transaksi", target: "80", targetPeriod: "daily", weight: 35 },
      { name: "Tutup kas tanpa selisih", type: "count", unit: "hari", target: "1", targetPeriod: "daily", weight: 25 },
      { ...ATTENDANCE, weight: 20 },
      { name: "Pelayanan pelanggan", type: "rating", weight: 20 },
    ],
  },
  {
    key: "admin_gudang",
    name: "Admin Gudang",
    description: "Pengelola stok & pengiriman: pesanan diproses, stok opname, dan ketepatan pencatatan.",
    indicators: [
      { name: "Pesanan dikemas & dikirim", type: "count", unit: "pesanan", target: "40", targetPeriod: "daily", weight: 35 },
      { name: "Stok opname", type: "count", unit: "kali", target: "1", targetPeriod: "weekly", weight: 20 },
      { name: "Ketepatan pencatatan stok", type: "rating", weight: 25 },
      { ...ATTENDANCE, weight: 20 },
    ],
  },
  {
    key: "staf_produksi",
    name: "Staf Produksi",
    description: "Pekerja produksi: jumlah unit, kualitas hasil kerja, dan kebersihan area kerja.",
    indicators: [
      { name: "Unit diproduksi", type: "count", unit: "unit", target: "200", targetPeriod: "daily", weight: 45 },
      { name: "Kualitas hasil kerja", type: "rating", weight: 20 },
      { name: "Kerapian & kebersihan area kerja", type: "rating", weight: 15 },
      { ...ATTENDANCE, weight: 20 },
    ],
  },
];

// Kolom DB untuk satu indikator — dipakai juga oleh KpiTemplatesService
export type IndicatorColumns = {
  name: string;
  type: KpiIndicatorType;
  unit: string | null;
  target: string;
  targetPeriod: KpiTargetPeriod | null;
  systemMetric: KpiSystemMetric | null;
  weight: number;
};

export function indicatorColumns(indicator: KpiIndicatorInput): IndicatorColumns {
  const base = { name: indicator.name, type: indicator.type, weight: indicator.weight };
  switch (indicator.type) {
    case "numeric":
    case "count":
      return { ...base, unit: indicator.unit, target: indicator.target, targetPeriod: indicator.targetPeriod, systemMetric: null };
    case "rating":
      return { ...base, unit: null, target: String(KPI_RATING_SCALE_MAX), targetPeriod: null, systemMetric: null };
    case "system":
      return { ...base, unit: null, target: indicator.target, targetPeriod: null, systemMetric: indicator.systemMetric };
  }
}

// Tambahkan template bawaan yang belum ada di usaha aktif (menurut builtin_key; nama yang sudah dipakai template lain
// juga dilewati). Mengembalikan template yang ditambahkan.
export async function seedBuiltinKpiTemplates(tx: Transaction, ctx: TenantContext): Promise<{ id: string; name: string }[]> {
  const added: { id: string; name: string }[] = [];
  for (const template of BUILTIN_KPI_TEMPLATES) {
    const total = template.indicators.reduce((sum, indicator) => sum + indicator.weight, 0);
    if (total !== KPI_WEIGHT_TOTAL) throw new Error(`[kpi/builtin] bobot template ${template.key} = ${total}, harus ${KPI_WEIGHT_TOTAL}`);

    const [row] = await tx
      .insert(kpiTemplates)
      .values({ tenantId: ctx.tenantId, name: template.name, description: template.description, builtinKey: template.key })
      .onConflictDoNothing()
      .returning({ id: kpiTemplates.id, name: kpiTemplates.name });
    if (!row) continue;
    await tx.insert(kpiIndicators).values(
      template.indicators.map((indicator, index) => ({ tenantId: ctx.tenantId, templateId: row.id, sortOrder: index, ...indicatorColumns(indicator) })),
    );
    added.push(row);
  }
  return added;
}
