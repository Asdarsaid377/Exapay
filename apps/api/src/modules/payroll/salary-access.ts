import { ForbiddenException } from "@nestjs/common";

import type { TenantContext, Transaction } from "../../database/tenant-transaction.js";
import { loadAttendanceViewer } from "../attendance/attendance-viewer.js";

// Gaji hanya untuk owner/admin (keputusan feature 28 — atasan tidak melihat gaji bawahan). Peran dibaca ulang dari DB
// (klaim JWT bisa basi 15 menit).
export async function requireSalaryManager(tx: Transaction, ctx: TenantContext): Promise<void> {
  const viewer = await loadAttendanceViewer(tx, ctx);
  if (!viewer?.manage) throw new ForbiddenException("Hanya pemilik atau admin yang dapat mengelola gaji");
}
