import type { NextRequest } from "next/server";

import { leaveAttachmentResponse } from "@/lib/api/leaveRequests";

type Context = { params: Promise<{ id: string }> };

// Buka lampiran pengajuan milik sendiri dari portal
export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  return leaveAttachmentResponse(id, new URL("/me/attendance", request.url));
}
