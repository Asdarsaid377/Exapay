import { selfieImageResponse } from "@/lib/api/attendanceSelfies";

type Context = { params: Promise<{ id: string; event: string }> };

// Selfie absen milik sendiri dari portal (kartu absen & riwayat — dicek API)
export async function GET(_request: Request, { params }: Context) {
  const { id, event } = await params;
  return selfieImageResponse(id, event);
}
