import { taskVerificationQuerySchema } from "@exapay/shared";
import { CircleCheck, CloudOff, Inbox } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { Pagination } from "@/components/common/Pagination";
import { PageHeader } from "@/components/layout/PageHeader";
import { TaskVerificationFilter } from "@/components/tasks/TaskVerificationFilter";
import { TaskVerificationList } from "@/components/tasks/TaskVerificationList";
import { fetchTaskVerification } from "@/lib/api/taskVerification";
import { taskVerificationHref } from "@/lib/taskVerificationLabels";

export const metadata: Metadata = { title: "Verifikasi tugas — Exapay" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

const EMPTY_TEXT = {
  approved: "Belum ada catatan tugas yang disetujui.",
  rejected: "Belum ada catatan tugas yang ditolak.",
  all: "Belum ada catatan tugas dari karyawan.",
} as const;

// Verifikasi catatan tugas harian (feature 20). Owner/admin: semua karyawan; atasan: bawahan langsung.
// Hanya catatan yang disetujui (angka koreksi bila ada) yang masuk skor KPI.
// Tanpa referensi desain — pola /attendance/requests + TaskLogList (izin user).
export default async function TaskVerificationPage({ searchParams }: Props) {
  const raw = await searchParams;
  const query = taskVerificationQuerySchema.parse({ status: first(raw.status), page: first(raw.page) });
  const result = await fetchTaskVerification(query);

  if (!result.ok) {
    return (
      <>
        <PageHeader title="Verifikasi tugas" />
        <EmptyState icon={CloudOff} title="Catatan tugas tidak dapat dimuat" description={result.error} />
      </>
    );
  }
  const list = result.data;
  const from = (list.page - 1) * list.pageSize + 1;
  const to = Math.min(list.page * list.pageSize, list.total);
  const footer =
    list.total > list.pageSize ? (
      <Pagination page={list.page} pageSize={list.pageSize} total={list.total} hrefFor={(page) => taskVerificationHref(query.status, page)} />
    ) : (
      <p className="text-small text-text-secondary tabular-nums">
        Menampilkan {from}–{to} dari {list.total} catatan
      </p>
    );

  return (
    <>
      <PageHeader
        title="Verifikasi tugas"
        description={
          list.scope === "all"
            ? "Catatan tugas harian seluruh karyawan. Hanya yang disetujui masuk skor KPI."
            : "Catatan tugas harian bawahan langsung Anda. Hanya yang disetujui masuk skor KPI."
        }
      />
      {first(raw.photo) === "error" ? <FormAlert tone="danger">Foto tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}
      <TaskVerificationFilter value={query.status} pendingCount={list.pendingCount} />
      {list.items.length === 0 ? (
        query.status === "pending" ? (
          <EmptyState
            icon={CircleCheck}
            title="Tidak ada yang menunggu"
            description={
              list.scope === "all"
                ? "Semua catatan tugas sudah diverifikasi. Catatan baru dari karyawan akan muncul di sini."
                : "Catatan tugas baru dari bawahan langsung Anda akan muncul di sini."
            }
          />
        ) : (
          <EmptyState icon={Inbox} title="Belum ada catatan" description={EMPTY_TEXT[query.status]} />
        )
      ) : (
        <TaskVerificationList items={list.items} timeZone={list.timeZone} bulk={query.status === "pending"} footer={footer} />
      )}
    </>
  );
}
