import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function BackToLoginLink() {
  return (
    <Link href="/login" className="inline-flex items-center gap-1.5 font-medium text-accent-strong hover:underline underline-offset-4">
      <ArrowLeft aria-hidden className="size-4" />
      Kembali ke halaman masuk
    </Link>
  );
}
