import { employees, memberships } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import { and, eq, type SQL, sql } from "drizzle-orm";

import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";

// Penglihat data absensi karyawan lain (persetujuan izin feature 15, rekap & koreksi feature 16):
// owner/admin → semua karyawan; atasan → bawahan langsung (supervisor_id = data karyawan miliknya).
export type AttendanceViewer = { role: MembershipRole; manage: boolean; ownEmployeeId: string | null };

// Peran dibaca ulang dari DB (klaim JWT bisa basi 15 menit). karyawan / bukan anggota → null.
export async function loadAttendanceViewer(tx: Transaction, ctx: TenantContext): Promise<AttendanceViewer | null> {
  if (!ctx.userId) return null;
  // Filter tenant wajib: policy own_memberships_select juga memperlihatkan membership user di usaha lain
  const [membership] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.tenantId, ctx.tenantId), eq(memberships.userId, ctx.userId)));
  if (!membership || membership.role === "karyawan") return null;
  const [own] = await tx.select({ id: employees.id }).from(employees).where(eq(employees.userId, ctx.userId));
  return { role: membership.role, manage: membership.role === "owner" || membership.role === "admin", ownEmployeeId: own?.id ?? null };
}

// Kondisi WHERE pada tabel employees. Atasan tanpa data karyawan tertaut tidak punya bawahan → tidak melihat apa pun.
export function viewerEmployeeScope(viewer: AttendanceViewer): SQL | undefined {
  if (viewer.manage) return undefined;
  return viewer.ownEmployeeId ? eq(employees.supervisorId, viewer.ownEmployeeId) : sql`false`;
}

export function viewerCanSee(viewer: AttendanceViewer, supervisorId: string | null): boolean {
  return viewer.manage || (viewer.ownEmployeeId !== null && supervisorId === viewer.ownEmployeeId);
}
