import { ArrowLeft } from "lucide-react";
import Link from "next/link";

type Props = {
  href: string;
  label: string;
};

// Tautan kembali di halaman payroll (pola KpiReviewsBackLink)
export function PayrollBackLink({ href, label }: Props) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 self-start px-1.5 text-sm font-bold text-accent-strong hover:text-accent-hover">
      <ArrowLeft aria-hidden className="size-4" />
      {label}
    </Link>
  );
}
