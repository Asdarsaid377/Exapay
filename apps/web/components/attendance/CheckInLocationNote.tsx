import type { AttendanceEvent, GeofenceResult } from "@exapay/shared";
import { MapPinOff, TriangleAlert } from "lucide-react";

import { checkInLocationNote } from "@/lib/workLocationLabels";

type Props = {
  event: AttendanceEvent;
  geofence: GeofenceResult | null;
};

const TONE_CLASSES = {
  warning: { box: "border-warning/30 bg-warning/10", icon: "text-warning-icon", Icon: TriangleAlert },
  neutral: { box: "border-border-control bg-fill-subtle", icon: "text-text-secondary", Icon: MapPinOff },
} as const;

// Keterangan lokasi di kartu absen portal setelah absen bertanda (design me-attendance-location "CheckInLocationNote").
// Peringatan ringan, bukan error — absen tetap diterima. Di lokasi / tidak dicek → tidak tampil.
export function CheckInLocationNote({ event, geofence }: Props) {
  const note = checkInLocationNote(event, geofence);
  if (!note) return null;
  const { box, icon, Icon } = TONE_CLASSES[note.tone];
  return (
    <div role="status" className={`flex gap-2.5 rounded-[14px] border px-3.5 py-3 ${box}`}>
      <Icon aria-hidden className={`mt-px size-4.5 shrink-0 ${icon}`} />
      <p className="text-sm text-pretty text-text-primary">{note.text}</p>
    </div>
  );
}
