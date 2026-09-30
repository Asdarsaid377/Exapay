import { ArrowLeft } from "lucide-react";
import Link from "next/link";

// Tautan kembali ke daftar template dari editor
export function KpiTemplatesBackLink() {
  return (
    <Link href="/kpi/templates" className="inline-flex items-center gap-1.5 self-start px-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover">
      <ArrowLeft aria-hidden className="size-4" />
      Template KPI
    </Link>
  );
}
