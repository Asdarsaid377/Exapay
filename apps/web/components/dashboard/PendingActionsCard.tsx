import { CircleCheck, ChevronRight } from "lucide-react";
import Link from "next/link";

import { buttonClassName } from "@/components/common/Button";

export type PendingAction = {
  key: string;
  title: string;
  description: string;
  action: string;
  href: string;
  primary?: boolean;
};

type Props = {
  items: PendingAction[];
};

// Tindakan tertunda (feature 35) — card snapshot dashboard.html: judul + jumlah (pill gelap), baris judul/sub + tombol
// (primer untuk payroll, sekunder lainnya). Mobile: tombol diganti chevron 44px. Kosong: state empty snapshot.
export function PendingActionsCard({ items }: Props) {
  return (
    <section aria-labelledby="pending-actions-title" className="glass-strong flex min-w-0 flex-col gap-2 rounded-card px-5 pt-5 pb-3 sm:px-6">
      <div className="flex items-center gap-2.5">
        <h2 id="pending-actions-title" className="font-display text-h2 font-bold tracking-[-0.01em] text-text-primary">
          Tindakan tertunda
        </h2>
        {items.length > 0 ? (
          <span className="h-5.5 min-w-5.5 rounded-full bg-inverse px-1.75 text-center text-xs leading-5.5 font-bold text-on-inverse tabular-nums">
            {items.length}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 pt-3 pb-5 text-center">
          <CircleCheck aria-hidden className="size-7 text-success" />
          <h3 className="font-display text-base font-bold text-text-primary">Belum ada tindakan tertunda</h3>
          <p className="max-w-90 text-sm text-pretty text-text-secondary">
            Log tugas, pengajuan izin, penilaian, dan payroll sudah ditangani. Hal yang perlu Anda putuskan akan muncul di sini.
          </p>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 border-t border-border-subtle py-3 first:border-t-0 sm:gap-4 sm:py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-bold text-text-primary sm:text-[15px]">{item.title}</p>
                <p className="text-[12.5px] text-text-secondary sm:text-small">{item.description}</p>
              </div>
              <Link href={item.href} className={buttonClassName({ variant: item.primary ? "primary" : "secondary", className: "max-sm:hidden" })}>
                {item.action}
              </Link>
              <Link
                href={item.href}
                aria-label={`${item.action}: ${item.title}`}
                className="grid size-11 shrink-0 place-items-center rounded-inner text-text-secondary hover:bg-glass-hover sm:hidden"
              >
                <ChevronRight aria-hidden className="size-4.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
