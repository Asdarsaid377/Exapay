import { COMPLIANCE_REMINDER_KIND_LABELS, type ComplianceReminder } from "@exapay/shared";

import type { BadgeTone } from "@/components/common/Badge";
import { monthLabel } from "@/lib/attendanceLabels";

// Label kalender kepatuhan (feature 33)

export type ComplianceActionOutcome = { kind: "error"; message: string } | { kind: "success" };

export function complianceTitle(reminder: ComplianceReminder): string {
  return COMPLIANCE_REMINDER_KIND_LABELS[reminder.kind];
}

// Badge tenggat: selesai · terlewat · hari ini · H-1 (besok) · H-n (≤ 7 hari = peringatan)
export function complianceDueBadge(reminder: ComplianceReminder): { tone: BadgeTone; label: string } {
  if (reminder.status === "done") return { tone: "success", label: "Selesai" };
  const days = reminder.daysUntil;
  if (days < 0) return { tone: "danger", label: `Terlewat ${-days} hari` };
  if (days === 0) return { tone: "danger", label: "Hari ini" };
  if (days === 1) return { tone: "warning", label: "Besok" };
  return { tone: days <= 7 ? "warning" : "neutral", label: `H-${days}` };
}

// Halaman per bulan; bulan berjalan tanpa param
export function complianceHref(month: string, currentMonth: string): string {
  return month === currentMonth ? "/compliance" : `/compliance?month=${month}`;
}

export function compliancePeriodLabel(reminder: ComplianceReminder): string | null {
  return reminder.periodMonth ? `Masa ${monthLabel(reminder.periodMonth)}` : null;
}
