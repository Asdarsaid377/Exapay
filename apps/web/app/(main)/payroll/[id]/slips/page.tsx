import { CloudOff, FileText, Info } from "lucide-react";
import type { Metadata } from "next";
import { z } from "zod";

import { Banner } from "@/components/common/Banner";
import { EmptyState } from "@/components/common/EmptyState";
import { FormAlert } from "@/components/common/FormAlert";
import { StatTile } from "@/components/common/StatTile";
import { PageHeader } from "@/components/layout/PageHeader";
import { PayrollBackLink } from "@/components/payroll/PayrollBackLink";
import { PayslipAutoRefresh } from "@/components/payroll/PayslipAutoRefresh";
import { PayslipRunActions } from "@/components/payroll/PayslipRunActions";
import { PayslipTable } from "@/components/payroll/PayslipTable";
import { fetchPayslipRun } from "@/lib/api/payslips";
import { runHref, runPeriodSummary, runTitle } from "@/lib/payrollRunLabels";
import { payslipsInProgress } from "@/lib/payslipLabels";

export const metadata: Metadata = { title: "Slip gaji — Exapay" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Slip gaji satu periode final (feature 31): PDF dibuat otomatis lewat antrean setelah final; owner/admin memeriksa,
// menerbitkan (karyawan berakun portal dikirimi email tautan), mengirim ulang email, membuka PDF.
// Tanpa referensi desain — pola /payroll/[id] (StatTile + tabel glass-data + aksi di PageHeader) (izin user).
export default async function PayslipsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const raw = await searchParams;
  const parsedId = z.uuid().safeParse(id);
  const result = parsedId.success ? await fetchPayslipRun(parsedId.data) : ({ ok: false, error: "Periode payroll tidak ditemukan" } as const);

  if (!result.ok) {
    return (
      <>
        <PayrollBackLink href={parsedId.success ? runHref(parsedId.data) : "/payroll"} label="Periode gaji" />
        <EmptyState icon={CloudOff} title="Slip gaji tidak dapat dimuat" description={result.error} />
      </>
    );
  }

  const { run, rows, excludedCount } = result.data;
  const ready = rows.filter((row) => row.status === "ready").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const waiting = rows.filter((row) => row.status === "pending" || row.status === "generating").length;
  const published = rows.filter((row) => row.publishedAt !== null).length;
  const publishable = rows.filter((row) => row.status === "ready" && row.publishedAt === null);
  const emailed = rows.filter((row) => row.email?.status === "sent").length;
  const withoutAccount = rows.filter((row) => !row.hasPortalAccount).length;
  const title = `Slip ${runTitle(run).replace(/^Gaji/, "gaji")}`;

  return (
    <>
      <PayslipAutoRefresh active={payslipsInProgress(rows)} />
      <PayrollBackLink href={runHref(run.id)} label={runTitle(run)} />
      <PageHeader
        title={title}
        description={runPeriodSummary(run)}
        actions={
          // Semua slip sudah terbit → tidak ada aksi lagi (kirim ulang email per baris)
          rows.some((row) => row.publishedAt === null) ? (
            <PayslipRunActions
              runId={run.id}
              title={title}
              publishable={publishable.length}
              publishableWithAccount={publishable.filter((row) => row.hasPortalAccount).length}
              retryable={failed + waiting}
            />
          ) : null
        }
      />

      {raw.pdf === "error" ? <FormAlert tone="danger">PDF slip tidak dapat dibuka. Coba lagi beberapa saat lagi.</FormAlert> : null}
      {failed > 0 ? (
        <Banner tone="danger" title={`${failed} slip gagal dibuat`} description="Klik Proses ulang untuk mencoba lagi. Jika tetap gagal, hubungi dukungan Exapay." />
      ) : null}
      {waiting > 0 ? (
        <Banner
          tone="neutral"
          icon={Info}
          title={`${waiting} slip sedang dibuat`}
          description="Halaman ini diperbarui otomatis. Jika tidak berubah setelah beberapa menit, klik Proses ulang."
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4">
        <StatTile label="Slip siap" value={`${ready}/${rows.length}`} note={excludedCount > 0 ? `${excludedCount} karyawan dikeluarkan — tanpa slip` : "Satu slip per karyawan dihitung"} />
        <StatTile label="Sudah terbit" value={String(published)} note="Terlihat di portal karyawan" />
        <StatTile label="Email terkirim" value={String(emailed)} note="Berisi tautan, tanpa angka gaji" />
        <StatTile label="Tanpa akun portal" value={String(withoutAccount)} note="Bagikan PDF secara langsung" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="Tidak ada slip di periode ini" description="Slip dibuat untuk karyawan yang dihitung saat payroll difinalisasi." />
      ) : (
        <PayslipTable
          runId={run.id}
          rows={rows}
          footer={
            <p className="text-small text-pretty text-text-secondary">
              {rows.length} slip · PDF dibuat dari snapshot payroll final, tidak dihitung ulang · slip yang sudah terbit tidak bisa ditarik kembali
            </p>
          }
        />
      )}
    </>
  );
}
