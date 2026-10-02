import { NotFoundState } from "@/components/common/NotFoundState";

// 404 portal karyawan — permukaan solid (batas lapisan blur portal)
export default function PortalNotFound() {
  return <NotFoundState homeHref="/me" homeLabel="Ke beranda" surface="solid" />;
}
