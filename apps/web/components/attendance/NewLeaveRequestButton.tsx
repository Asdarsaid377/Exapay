"use client";

import { CalendarPlus } from "lucide-react";
import { useState } from "react";

import { LeaveRequestFormDialog } from "@/components/attendance/LeaveRequestFormDialog";
import { Button } from "@/components/common/Button";

type Props = {
  today: string;
};

// Tombol "Ajukan izin" di header /me/attendance → dialog form pengajuan
export function NewLeaveRequestButton({ today }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} className="max-sm:w-full">
        <CalendarPlus aria-hidden className="size-4.25" />
        Ajukan izin
      </Button>
      <LeaveRequestFormDialog open={open} onClose={() => setOpen(false)} today={today} />
    </>
  );
}
