import type { NextRequest } from "next/server";

import { leaveAttachmentResponse } from "@/lib/api/leaveRequests";

type Context = { params: Promise<{ id: string }> };

// Buka lampiran pengajuan izin dari halaman persetujuan (owner/admin/atasan — cakupan dicek API)
export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  return leaveAttachmentResponse(id, new URL("/attendance/requests", request.url));
}
