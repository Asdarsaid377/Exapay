"use client";

import type { TaskIndicatorDay } from "@exapay/shared";
import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/common/Button";
import { TaskLogFormDialog } from "@/components/tasks/TaskLogFormDialog";

type Props = {
  workDate: string;
  indicators: TaskIndicatorDay[];
  // home = tombol secondary lebar penuh di kartu /me (me.html); header = primary di PageHeader /me/tasks
  placement: "home" | "header";
  disabled?: boolean;
};

// Tombol "Catat tugas" → dialog form catatan
export function LogTaskButton({ workDate, indicators, placement, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={placement === "home" ? "secondary" : "primary"}
        size={placement === "home" ? "lg" : "md"}
        fullWidth={placement === "home"}
        className={placement === "header" ? "max-sm:w-full" : undefined}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden className="size-4.5" />
        Catat tugas
      </Button>
      {/* key: form mulai bersih untuk tanggal lain */}
      <TaskLogFormDialog key={workDate} open={open} onClose={() => setOpen(false)} workDate={workDate} indicators={indicators} />
    </>
  );
}
