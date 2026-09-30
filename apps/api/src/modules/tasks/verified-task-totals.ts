import { taskLogs } from "@exapay/db";
import { trimDecimal } from "@exapay/shared";
import { and, between, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { Transaction } from "../../database/tenant-transaction.js";

export type VerifiedTaskTotal = { employeeId: string; indicatorId: string; total: string };

// Realisasi indikator yang diakui untuk skor KPI (feature 21): hanya catatan yang disetujui atasan, memakai
// verified_quantity (angka karyawan atau koreksi atasan). Menunggu & ditolak tidak pernah dihitung; pekerjaan lain tanpa indikator.
export async function verifiedTaskTotals(tx: Transaction, employeeIds: readonly string[], from: string, to: string): Promise<VerifiedTaskTotal[]> {
  if (employeeIds.length === 0) return [];
  const rows = await tx
    .select({
      employeeId: taskLogs.employeeId,
      indicatorId: taskLogs.indicatorId,
      total: sql<string>`sum(${taskLogs.verifiedQuantity})::text`,
    })
    .from(taskLogs)
    .where(
      and(
        inArray(taskLogs.employeeId, [...employeeIds]),
        between(taskLogs.workDate, from, to),
        eq(taskLogs.status, "approved"),
        isNotNull(taskLogs.verifiedQuantity),
      ),
    )
    .groupBy(taskLogs.employeeId, taskLogs.indicatorId);
  // CHECK task_logs_verified_quantity: verified_quantity terisi ⇒ indikator terisi
  return rows.flatMap((row) => (row.indicatorId ? [{ employeeId: row.employeeId, indicatorId: row.indicatorId, total: trimDecimal(row.total) }] : []));
}
