import type { NextRequest } from "next/server";

import { taskPhotoResponse } from "@/lib/api/taskLogs";

type Context = { params: Promise<{ id: string }> };

// Buka foto bukti catatan tugas milik sendiri dari portal
export async function GET(request: NextRequest, { params }: Context) {
  const { id } = await params;
  return taskPhotoResponse(id, new URL("/me/tasks", request.url));
}
