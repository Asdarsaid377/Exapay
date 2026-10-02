import { NotFoundState } from "@/components/common/NotFoundState";

// 404 area owner/admin/atasan (mis. path di luar menu yang tertangkap catch-all, data yang tidak ada)
export default function MainNotFound() {
  return <NotFoundState homeHref="/dashboard" homeLabel="Ke dashboard" />;
}
