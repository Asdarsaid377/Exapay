import type { ComplianceReminder } from "@exapay/shared";
import Link from "next/link";

import { CalendarDate } from "@/components/attendance/CalendarDate";
import { Badge } from "@/components/common/Badge";
import { ComplianceReminderAction } from "@/components/compliance/ComplianceReminderAction";
import { complianceDueBadge, compliancePeriodLabel, complianceTitle } from "@/lib/complianceLabels";

type Props = {
  reminders: ComplianceReminder[];
};

// Daftar pengingat kepatuhan (feature 33) — baris pola "Pengingat kepatuhan" dashboard.html: tanggal 44px · judul + sub ·
// badge tenggat; ditambah aksi tandai selesai/batalkan. Yang selesai diredupkan.
export function ComplianceReminderList({ reminders }: Props) {
  return (
    <ul>
      {reminders.map((reminder) => {
        const done = reminder.status === "done";
        const badge = complianceDueBadge(reminder);
        const period = compliancePeriodLabel(reminder);
        return (
          <li key={reminder.key} className="flex min-h-16 items-center gap-3 border-t border-border-subtle px-5 py-3 first:border-t-0 sm:gap-4 lg:px-6">
            <CalendarDate date={reminder.dueDate} muted={done} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className={`text-[14.5px] font-bold ${done ? "text-text-tertiary" : "text-text-primary"}`}>{complianceTitle(reminder)}</p>
              <p className="text-small text-text-secondary">
                {reminder.employee ? (
                  <Link href={`/employees/${reminder.employee.id}`} className="font-bold text-text-primary hover:text-accent-strong hover:underline">
                    {reminder.employee.fullName}
                  </Link>
                ) : (
                  period
                )}
                {done && reminder.doneByName ? <span className="text-text-tertiary"> · ditandai {reminder.doneByName}</span> : null}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-4">
              <Badge tone={badge.tone}>{badge.label}</Badge>
              <ComplianceReminderAction reminderKey={reminder.key} done={done} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
