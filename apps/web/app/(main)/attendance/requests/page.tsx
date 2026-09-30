import { leaveRequestListQuerySchema } from "@exapay/shared";
import { CircleCheck, CloudOff, Inbox } from "lucide-react";
import type { Metadata } from "next";

import { LeaveRequestFilter } from "@/components/attendance/LeaveRequestFilter";
import { LeaveRequestTable } from "@/components/attendance/LeaveRequestTable";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { Pagination } from "@/components/common/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { fetchLeaveRequests } from "@/lib/api/leaveRequests";
import { leaveRequestsHref } from "@/lib/leaveLabels";

export const metadata: Metadata = { title: "Pengajuan izin — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

const EMPTY_TEXT = {
  approved: "Belum ada pengajuan yang disetujui.",
  rejected: "Belum ada pengajuan yang ditolak.",
  all: "Belum ada pengajuan izin, sakit, atau cuti.",
} as const;

// Persetujuan izin/sakit/cuti (feature 15). Owner/admin: semua karyawan; atasan: bawahan langsung.
// Tanpa referensi desain — pola halaman Karyawan (izin user).
export default async function LeaveRequestsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const query = leaveRequestListQuerySchema.parse({ status: first(raw.status), page: first(raw.page) });
  const result = await fetchLeaveRequests(query);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Pengajuan izin" />
        <EmptyState icon={CloudOff} title="Pengajuan tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;
  const from = (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const footer =
    list.total > list.pageSize ? (
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(page) => leaveRequestsHref(query.status, page)} />
    ) : (
      <p className="text-small text-text-secondary tabular-nums">
        Menampilkan {from}–{to} dari {list.total} pengajuan
      </p>
    );

  return (
    <>
      <PageHeader
        title="Pengajuan izin"
        description={list.scope === "all" ? "Izin, sakit, dan cuti seluruh karyawan." : "Izin, sakit, dan cuti dari bawahan langsung Anda."}
      />
      {first(raw.attachment) === "error" ? <FormAlert tone="danger">Lampiran tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}
      <LeaveRequestFilter value={query.status} pendingCount={list.pendingCount} />
      {list.items.length === 0 ? (
        query.status === "pending" ? (
          <EmptyState
            icon={CircleCheck}
            title="Tidak ada yang menunggu"
            description={
              list.scope === "all"
                ? "Semua pengajuan sudah diputuskan. Pengajuan baru dari karyawan akan muncul di sini."
                : "Pengajuan baru dari bawahan langsung Anda akan muncul di sini."
            }
          />
        ) : (
          <EmptyState icon={Inbox} title="Belum ada pengajuan" description={EMPTY_TEXT[query.status]} />
        )
      ) : (
        <LeaveRequestTable requests={list.items} footer={footer} />
      )}
    </>
  );
}
