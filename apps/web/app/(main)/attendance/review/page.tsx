import { attendanceReviewListQuerySchema } from "@exapay/shared";
import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AttendanceReviewFilter } from "@/components/attendance/AttendanceReviewFilter";
import { AttendanceReviewTable } from "@/components/attendance/AttendanceReviewTable";
import { buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { Pagination } from "@/components/common/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchAttendanceReviews } from "@/lib/api/workLocations";
import { correctionsHref } from "@/lib/attendanceRecapLabels";
import { getSession } from "@/lib/auth/getSession";
import { todayIso } from "@/lib/datetime";
import { attendanceReviewsHref } from "@/lib/workLocationLabels";

export const metadata: Metadata = { title: "Tinjauan absensi — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

// Tinjauan absen bertanda (feature 44, design context/designs/attendance-review.html). Owner/admin: semua karyawan + tautan koreksi;
// atasan: bawahan langsung (cakupan dari API). Keputusan tidak mengubah jam/gaji.
export default async function AttendanceReviewPage({ searchParams }: Props) {
  const raw = await searchParams;
  const query = attendanceReviewListQuerySchema.parse({ status: first(raw.status), flag: first(raw.flag), month: first(raw.month), page: first(raw.page) });
  const [result, session] = await Promise.all([fetchAttendanceReviews(query), getSession()]);
  const role = session?.activeTenant?.role;
  const manage = role === "owner" || role === "admin";

  const description = (
    <>
      Absen bertanda tetap tercatat dan tidak mengubah gaji.{" "}
      {manage ? (
        <>
          Koreksi jam lewat menu{" "}
          <Link href="/attendance/corrections" className="font-bold text-accent-strong hover:text-accent-hover hover:underline">
            Koreksi
          </Link>
          .
        </>
      ) : (
        "Bawahan langsung Anda saja."
      )}
    </>
  );

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Tinjauan absensi" description={description} />
        <EmptyState icon={CloudOff} title="Tinjauan absensi tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;
  const currentMonth = todayIso(list.timeZone).slice(0, 7);
  const filtered = query.flag !== "all" || query.month !== undefined;

  let body;
  if (!list.hasLocations && list.total === 0 && !filtered) {
    body = (
      <EmptyState
        title="Lokasi kerja belum diatur"
        description="Tanpa lokasi kerja, absen tidak dicek lokasinya dan tidak ada yang perlu ditinjau."
        action={
          manage ? (
            <Link href="/settings/locations" className={buttonClassName({ size: "lg" })}>
              Atur lokasi kerja
            </Link>
          ) : undefined
        }
      />
    );
  } else if (list.items.length === 0) {
    body =
      query.status === "pending" && !filtered ? (
        <EmptyState title="Tidak ada absen yang perlu ditinjau" description="Absen di luar lokasi kerja akan muncul di sini." />
      ) : (
        <EmptyState
          title="Tidak ada absen yang cocok"
          description="Coba ubah filter jenis tanda atau periode."
          action={
            <Link href={attendanceReviewsHref({ status: query.status })} className={buttonClassName({ variant: "secondary" })}>
              Hapus filter
            </Link>
          }
        />
      );
  } else {
    const from = (list.page - 1) * list.pageSize + 1;
    const to = Math.min(list.page * list.pageSize, list.total);
    const footer =
      list.total > list.pageSize ? (
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(page) => attendanceReviewsHref({ ...query, page })} />
      ) : (
        <p className="text-small text-text-secondary tabular-nums">
          Menampilkan {from}–{to} dari {list.total} absen
        </p>
      );
    body = (
      <AttendanceReviewTable
        items={list.items}
        timeZone={list.timeZone}
        decisionHeading={query.status !== "pending"}
        correctionHrefFor={(item) =>
          manage ? correctionsHref({ employeeId: item.employee.id, view: { kind: "month", month: item.workDate.slice(0, 7) }, currentMonth }) : null
        }
        footer={footer}
      />
    );
  }

  return (
    <>
      <PageHeader title="Tinjauan absensi" description={description} />
      <AttendanceReviewFilter query={query} pendingCount={list.pendingCount} currentMonth={currentMonth} />
      {body}
    </>
  );
}
