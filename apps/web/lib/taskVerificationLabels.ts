import type { TaskVerificationFilter, TaskVerificationItem } from "@exapay/shared";

import { formatQuantity } from "@/lib/taskLogLabels";

// Teks & tautan verifikasi tugas (feature 20)

export function taskVerificationHref(status: TaskVerificationFilter, page = 1): string {
  const params = new URLSearchParams();
  if (status !== "pending") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/kpi/verification?${query}` : "/kpi/verification";
}

// Foto bukti lewat Route Handler area staf (proxy menjaga peran per area)
export function verificationPhotoHref(id: string, version: string): string {
  return `/kpi/verification/${id}/photo?v=${encodeURIComponent(version)}`;
}

export type TaskLogGroup = { key: string; employee: TaskVerificationItem["employee"]; workDate: string; items: TaskVerificationItem[] };

// Catatan berurutan milik karyawan & tanggal yang sama → satu kelompok (API sudah mengurutkan)
export function groupByEmployeeDay(items: TaskVerificationItem[]): TaskLogGroup[] {
  const groups: TaskLogGroup[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.employee.id === item.employee.id && last.workDate === item.workDate) last.items.push(item);
    else groups.push({ key: `${item.employee.id}:${item.workDate}:${item.id}`, employee: item.employee, workDate: item.workDate, items: [item] });
  }
  return groups;
}

export function itemTitle(item: Pick<TaskVerificationItem, "indicator">): string {
  return item.indicator?.name ?? "Pekerjaan lain";
}

// "46 cup"; null = pekerjaan lain
export function itemQuantity(item: Pick<TaskVerificationItem, "indicator" | "quantity">): string | null {
  return item.indicator && item.quantity ? `${formatQuantity(item.quantity)} ${item.indicator.unit}` : null;
}

// Angka yang diakui berbeda dengan angka karyawan
export function isCorrected(item: Pick<TaskVerificationItem, "quantity" | "verifiedQuantity">): boolean {
  return item.verifiedQuantity !== null && item.quantity !== null && item.verifiedQuantity !== item.quantity;
}
