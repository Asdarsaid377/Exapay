"use client";

import { EMPLOYEE_IMPORT_COLUMNS, EMPLOYEE_IMPORT_MAX_BYTES, EMPLOYEE_IMPORT_MAX_ROWS, type EmployeeImportPreview, type EmployeeImportResult } from "@exapay/shared";
import { CircleCheck, Download } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";

import { importEmployees, previewEmployeeImport } from "@/actions/employees";
import { Banner } from "@/components/common/Banner";
import { Button, buttonClassName } from "@/components/common/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { FileDropzone } from "@/components/common/FileDropzone";
import { FormSection } from "@/components/common/FormSection";
import { SegmentedControl } from "@/components/common/SegmentedControl";
import { ImportPreviewTable } from "@/components/employees/ImportPreviewTable";

type Props = {
  // Unduh template gagal (Route Handler mengarahkan kembali dengan ?template=error)
  templateError?: boolean;
};

type Filter = "invalid" | "valid" | "all";

type State =
  | { step: "select"; error: string | null }
  | { step: "preview"; file: File; preview: EmployeeImportPreview; error: string | null }
  | { step: "done"; result: EmployeeImportResult };

const REQUIRED_COLUMNS = EMPLOYEE_IMPORT_COLUMNS.filter((column) => column.required).map((column) => column.header);
const MAX_MB = EMPLOYEE_IMPORT_MAX_BYTES / (1024 * 1024);
const FILE_HINT = `.xlsx · maks. ${MAX_MB} MB · ${EMPLOYEE_IMPORT_MAX_ROWS} baris`;

// Impor karyawan (feature 12): 1) unduh template, 2) unggah → pratinjau per baris (belum disimpan),
// 3) konfirmasi → API memeriksa ulang file yang sama lalu menyimpan baris valid. File hanya di memori browser.
export function EmployeeImportFlow({ templateError = false }: Props) {
  const id = useId();
  const [state, setState] = useState<State>({ step: "select", error: null });
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [filter, setFilter] = useState<Filter>("invalid");
  const replaceInput = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  async function check(file: File) {
    setBusy("preview");
    const body = new FormData();
    body.set("file", file);
    const outcome = await previewEmployeeImport(body);
    setBusy(null);
    if (outcome.kind === "error") {
      setState((current) => (current.step === "preview" ? { ...current, error: outcome.message } : { step: "select", error: outcome.message }));
      return;
    }
    setFilter(outcome.preview.invalidCount > 0 ? "invalid" : "all");
    setState({ step: "preview", file, preview: outcome.preview, error: null });
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  async function commit(file: File) {
    setBusy("commit");
    const body = new FormData();
    body.set("file", file);
    const outcome = await importEmployees(body);
    setBusy(null);
    if (outcome.kind === "error") {
      setState((current) => (current.step === "preview" ? { ...current, error: outcome.message } : current));
      return;
    }
    setState({ step: "done", result: outcome.result });
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const visibleRows = useMemo(() => {
    if (state.step !== "preview") return [];
    const rows = state.preview.rows;
    if (filter === "invalid") return rows.filter((row) => row.issues.length > 0);
    if (filter === "valid") return rows.filter((row) => row.issues.length === 0);
    return rows;
  }, [state, filter]);

  if (state.step === "done") {
    const { imported, skipped } = state.result;
    return (
      <div ref={top} className="scroll-mt-24">
        <EmptyState
          icon={CircleCheck}
          iconTone="success"
          title={`${imported} karyawan berhasil diimpor`}
          description={
            skipped > 0
              ? `${skipped} baris dilewati karena bermasalah. Perbaiki baris tersebut di file lalu impor lagi — karyawan yang sudah tersimpan akan terdeteksi sebagai duplikat, jadi tidak tersimpan dua kali.`
              : "Semua baris tersimpan. Lengkapi data lain (akun portal, dll.) dari halaman detail tiap karyawan."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button variant="secondary" onClick={() => setState({ step: "select", error: null })}>
                Impor file lain
              </Button>
              <Link href="/employees" className={buttonClassName()}>
                Lihat daftar karyawan
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  if (state.step === "select") {
    return (
      <div ref={top} className="flex scroll-mt-24 flex-col gap-4 lg:gap-5">
        {templateError ? <Banner tone="danger" title="Template tidak dapat diunduh" description="Periksa koneksi lalu coba unduh lagi." /> : null}
        <FormSection title="1. Unduh template" description="Template berisi judul kolom, daftar departemen & jabatan usaha Anda, dan petunjuk pengisian.">
          <div className="flex flex-col items-start gap-4">
            <p className="text-sm text-text-secondary text-pretty">
              Kolom wajib: <span className="text-text-primary">{REQUIRED_COLUMNS.join(", ")}</span>. NIK, NPWP, dan nomor rekening opsional — disimpan terenkripsi.
            </p>
            {/* Tautan biasa (bukan Link): unduhan file dari Route Handler, bukan navigasi halaman */}
            <a href="/employees/import/template" className={buttonClassName({ variant: "secondary" })}>
              <Download aria-hidden className="size-4.25" />
              Unduh template
            </a>
          </div>
        </FormSection>
        <FormSection title="2. Unggah file" description="Setiap baris diperiksa dulu. Belum ada data yang disimpan sampai Anda menekan Impor.">
          <FileDropzone
            id={`${id}-file`}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hint={FILE_HINT}
            onSelect={check}
            loading={busy === "preview"}
            loadingLabel="Memeriksa file…"
            error={state.error ?? undefined}
          />
        </FormSection>
      </div>
    );
  }

  const { file, preview, error } = state;
  const total = preview.rows.length;
  const filterOptions = [
    { value: "invalid" as const, label: `Perlu diperbaiki (${preview.invalidCount})` },
    { value: "valid" as const, label: `Siap (${preview.validCount})` },
    { value: "all" as const, label: `Semua (${total})` },
  ];

  return (
    <div ref={top} className="flex scroll-mt-24 flex-col gap-4 lg:gap-5">
      <section className="glass-strong flex flex-col gap-3 rounded-card p-4.5 sm:flex-row sm:items-center sm:justify-between lg:px-6 lg:py-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="truncate font-display text-base font-bold text-text-primary lg:text-[17px]">{file.name}</h2>
          <p className="text-small text-text-secondary tabular-nums">
            {total} baris · {preview.validCount} siap diimpor · {preview.invalidCount} perlu diperbaiki
          </p>
        </div>
        <input
          ref={replaceInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(event) => {
            const next = event.target.files?.[0];
            event.target.value = "";
            if (next) void check(next);
          }}
        />
        <div className="flex shrink-0 gap-2.5">
          <Button variant="secondary" onClick={() => void check(file)} loading={busy === "preview"} disabled={busy !== null}>
            Periksa ulang
          </Button>
          <Button variant="secondary" onClick={() => replaceInput.current?.click()} disabled={busy !== null}>
            Ganti file
          </Button>
        </div>
      </section>

      {error ? <Banner tone="danger" title="Impor belum berhasil" description={error} /> : null}
      {preview.validCount === 0 ? (
        <Banner tone="danger" title="Belum ada baris yang bisa diimpor" description="Perbaiki kesalahan di bawah pada file Excel, simpan, lalu pilih Periksa ulang atau Ganti file." />
      ) : preview.invalidCount > 0 ? (
        <Banner
          tone="warning"
          title={`${preview.invalidCount} baris perlu diperbaiki`}
          description={`Baris ini tidak ikut diimpor. Perbaiki di file lalu periksa ulang, atau lanjutkan dengan ${preview.validCount} baris yang siap.`}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="max-sm:hidden">
          <SegmentedControl label="Tampilkan baris" options={filterOptions} value={filter} onChange={setFilter} />
        </div>
        <div className="sm:hidden">
          <SegmentedControl label="Tampilkan baris" options={filterOptions.map((option) => ({ ...option, label: option.label.replace("Perlu diperbaiki", "Salah") }))} value={filter} onChange={setFilter} fullWidth />
        </div>
        {visibleRows.length === 0 ? (
          <EmptyState
            icon={CircleCheck}
            iconTone="success"
            title={filter === "invalid" ? "Tidak ada baris bermasalah" : "Belum ada baris yang siap"}
            description={filter === "invalid" ? "Semua baris lolos pemeriksaan." : "Perbaiki kesalahan di file lalu periksa ulang."}
          />
        ) : (
          <ImportPreviewTable rows={visibleRows} />
        )}
      </div>

      <div className="glass-data sticky bottom-2.5 z-10 flex flex-col gap-3 rounded-[26px] p-2.5 lg:static lg:flex-row lg:items-center lg:justify-between lg:rounded-card lg:py-3 lg:pr-3 lg:pl-5.5">
        <p className="hidden text-small text-text-secondary lg:block">Baris yang bermasalah dilewati. Setiap karyawan yang diimpor tercatat di log audit.</p>
        <div className="grid grid-cols-[1fr_1.6fr] gap-2 lg:flex lg:gap-2.5">
          <Button variant="secondary" size="lg" className="lg:h-11" onClick={() => setState({ step: "select", error: null })} disabled={busy !== null}>
            Batal
          </Button>
          <Button size="lg" className="lg:h-11 lg:min-w-44" onClick={() => void commit(file)} loading={busy === "commit"} disabled={preview.validCount === 0 || busy === "preview"}>
            {busy === "commit" ? "Mengimpor…" : `Impor ${preview.validCount} karyawan`}
          </Button>
        </div>
      </div>
    </div>
  );
}
