import { selfieImageResponse } from "@/lib/api/attendanceSelfies";

type Context = { params: Promise<{ id: string; event: string }> };

// Selfie absen untuk rincian absensi & antrean tinjauan (owner/admin, atasan untuk bawahan langsung — dicek API)
export async function GET(_request: Request, { params }: Context) {
  const { id, event } = await params;
  return selfieImageResponse(id, event);
}
