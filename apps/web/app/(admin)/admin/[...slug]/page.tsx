import { notFound } from "next/navigation";

// Path /admin/* yang belum punya halaman (mis. /admin/billing sebelum feature 42) → 404 di dalam panel super-admin.
// Tanpa ini path tsb jatuh ke catch-all area usaha (main), yang mengakhiri sesi super-admin karena tanpa usaha aktif.
export default function AdminNotFoundPage(): never {
  notFound();
}
