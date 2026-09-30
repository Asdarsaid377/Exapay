"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { CompanyHolidayFormDialog } from "@/components/attendance/CompanyHolidayFormDialog";
import { DeleteCompanyHolidayDialog } from "@/components/attendance/DeleteCompanyHolidayDialog";
import { DropdownMenu } from "@/components/common/DropdownMenu";

type Props = {
  holiday: { id: string; date: string; name: string };
  year: number;
  currentYear: number;
};

const ITEM =
  "flex min-h-11 w-full items-center gap-2.5 rounded-inner px-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45";

// Menu aksi per libur usaha (ubah / hapus) — pola OrgItemActions
export function CompanyHolidayActions({ holiday, year, currentYear }: Props) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  return (
    <>
      <DropdownMenu
        label={`Aksi untuk ${holiday.name}`}
        align="end"
        panelClassName="w-52"
        triggerClassName="grid size-10 place-items-center rounded-field text-text-secondary transition-colors hover:bg-glass-hover hover:text-text-primary"
        trigger={<MoreHorizontal aria-hidden className="size-5" />}
      >
        {(close) => (
          <>
            <button
              type="button"
              className={`${ITEM} text-text-primary hover:bg-accent/10`}
              onClick={() => {
                close();
                setDialog("edit");
              }}
            >
              <Pencil aria-hidden className="size-4.5 text-text-secondary" />
              Ubah
            </button>
            <button
              type="button"
              className={`${ITEM} font-bold text-danger-text hover:bg-danger/8`}
              onClick={() => {
                close();
                setDialog("delete");
              }}
            >
              <Trash2 aria-hidden className="size-4.5" />
              Hapus
            </button>
          </>
        )}
      </DropdownMenu>
      <CompanyHolidayFormDialog
        key={`${holiday.date}-${holiday.name}`}
        open={dialog === "edit"}
        onClose={() => setDialog(null)}
        year={year}
        currentYear={currentYear}
        holiday={holiday}
      />
      <DeleteCompanyHolidayDialog open={dialog === "delete"} onClose={() => setDialog(null)} holiday={holiday} />
    </>
  );
}
