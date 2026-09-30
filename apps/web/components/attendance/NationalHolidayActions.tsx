"use client";

import { Briefcase, CalendarOff, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { setNationalHolidayObservance } from "@/actions/workCalendar";
import { DropdownMenu } from "@/components/common/DropdownMenu";

type Props = {
  date: string;
  name: string;
  observed: boolean;
};

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-medium text-text-primary transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Menu per libur nasional: tetap masuk kerja ↔ diliburkan kembali (pola OrgItemActions)
export function NationalHolidayActions({ date, name, observed }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(close: () => void) {
    close();
    setError(null);
    setPending(true);
    try {
      const outcome = await setNationalHolidayObservance(date, !observed);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat terhubung ke server. Coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <p role="alert" className="max-w-40 text-caption text-danger-text">
          {error}
        </p>
      ) : null}
      <DropdownMenu
        label={`Aksi untuk ${name}`}
        align="end"
        panelClassName="w-64"
        triggerClassName={`grid size-10 place-items-center rounded-field text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary ${pending ? "animate-exa-pulse" : ""}`}
        trigger={<MoreHorizontal aria-hidden className="size-5" />}
      >
        {(close) =>
          observed ? (
            <button type="button" className={ITEM} disabled={pending} onClick={() => toggle(close)}>
              <Briefcase aria-hidden className="size-4.5 text-text-secondary" />
              Tetap masuk kerja
            </button>
          ) : (
            <button type="button" className={ITEM} disabled={pending} onClick={() => toggle(close)}>
              <CalendarOff aria-hidden className="size-4.5 text-text-secondary" />
              Jadikan hari libur
            </button>
          )
        }
      </DropdownMenu>
    </div>
  );
}
