import type { OrgKind } from "@exapay/shared";

// Teks UI per daftar di /organization
export const ORG_LABELS: Record<
  OrgKind,
  { title: string; singular: string; description: string; placeholder: string; emptyTitle: string; emptyDescription: string }
> = {
  departments: {
    title: "Departemen",
    singular: "departemen",
    description: "Kelompok kerja di usaha Anda, mis. Produksi atau Toko.",
    placeholder: "Mis. Produksi",
    emptyTitle: "Belum ada departemen",
    emptyDescription: "Tambahkan departemen untuk mengelompokkan karyawan, mis. Produksi, Gudang, atau Toko.",
  },
  positions: {
    title: "Jabatan",
    singular: "jabatan",
    description: "Posisi karyawan. Template KPI dibuat per jabatan.",
    placeholder: "Mis. Kasir",
    emptyTitle: "Belum ada jabatan",
    emptyDescription: "Tambahkan jabatan seperti Kasir, Sales, atau Staf Produksi. Template KPI nanti dibuat per jabatan.",
  },
};
