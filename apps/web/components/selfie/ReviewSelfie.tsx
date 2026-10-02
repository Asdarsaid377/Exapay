"use client";

import type { AttendanceReviewItem } from "@exapay/shared";
import { useState } from "react";

import { SelfieThumb } from "@/components/selfie/SelfieThumb";
import { SelfieViewer } from "@/components/selfie/SelfieViewer";
import { SELFIE_EVENT_LABELS, selfieSrc } from "@/lib/selfies";

type Props = {
  item: AttendanceReviewItem;
  timeZone: string;
};

// Thumbnail selfie di antrean tinjauan (design attendance-review: kolom Absen) → penampil foto absen itu
export function ReviewSelfieThumb({ item, timeZone }: Props) {
  const [open, setOpen] = useState(false);
  if (item.selfie === null) return null;
  const src = selfieSrc("staff", item.recordId, item.event);
  return (
    <>
      <SelfieThumb
        state={item.selfie}
        src={src}
        label={`Lihat selfie absen ${SELFIE_EVENT_LABELS[item.event].toLowerCase()} ${item.employee.fullName}`}
        onOpen={() => setOpen(true)}
      />
      {open ? (
        <SelfieViewer
          open
          onClose={() => setOpen(false)}
          title={item.employee.fullName}
          description={item.employee.positionName}
          workDate={item.workDate}
          timeZone={timeZone}
          shots={[
            {
              event: item.event,
              state: item.selfie,
              src,
              at: item.at,
              geofence: { status: item.flag.kind, distanceM: item.flag.distanceM, locationName: item.flag.locationName, accuracyM: item.flag.accuracyM },
            },
          ]}
          initialEvent={item.event}
        />
      ) : null}
    </>
  );
}

// Bukti foto di dialog keputusan (design attendance-review "ReviewDecisionDialog · bukti foto"): 120×150 di samping ringkasan
export function ReviewSelfiePhoto({ item }: { item: AttendanceReviewItem }) {
  const [failed, setFailed] = useState(false);
  if (item.selfie === null) return null;
  if (item.selfie === "expired") {
    return (
      <div className="grid h-[150px] w-30 shrink-0 place-items-center rounded-2xl border border-dashed border-border-outline p-2.5 text-center text-caption text-text-muted">
        Foto sudah dihapus
      </div>
    );
  }
  if (failed) {
    return (
      <div className="grid h-[150px] w-30 shrink-0 place-items-center rounded-2xl border border-dashed border-danger/45 bg-danger/5 p-2.5 text-center text-caption text-danger-text">
        Foto tidak dapat dibuka
      </div>
    );
  }
  return (
    <img
      src={selfieSrc("staff", item.recordId, item.event)}
      alt={`Selfie absen ${SELFIE_EVENT_LABELS[item.event].toLowerCase()} ${item.employee.fullName}`}
      onError={() => setFailed(true)}
      className="h-[150px] w-30 shrink-0 rounded-2xl bg-photo-placeholder object-cover"
    />
  );
}
