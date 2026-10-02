import { NotFoundState } from "@/components/common/NotFoundState";

// 404 panel super-admin (mis. /admin/billing sebelum feature 42)
export default function AdminNotFound() {
  return <NotFoundState homeHref="/admin/tenants" homeLabel="Ke daftar tenant" />;
}
