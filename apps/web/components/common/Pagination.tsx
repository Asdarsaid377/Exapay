import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button, buttonClassName } from "@/components/common/Button";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  // URL untuk halaman tertentu (mempertahankan filter lain)
  hrefFor: (page: number) => string;
};

const LINK = buttonClassName({ variant: "secondary" });

// Navigasi halaman sebelumnya/berikutnya di bawah daftar. Server component (tautan biasa).
export function Pagination({ page, pageSize, total, hrefFor }: Props) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
      <p className="text-small text-text-secondary tabular-nums">
        {from}–{to} dari {total}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={LINK}>
            <ChevronLeft aria-hidden className="size-4" />
            Sebelumnya
          </Link>
        ) : (
          <Button variant="secondary" disabled>
            <ChevronLeft aria-hidden className="size-4" />
            Sebelumnya
          </Button>
        )}
        {page < lastPage ? (
          <Link href={hrefFor(page + 1)} className={LINK}>
            Berikutnya
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        ) : (
          <Button variant="secondary" disabled>
            Berikutnya
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        )}
      </div>
    </nav>
  );
}
