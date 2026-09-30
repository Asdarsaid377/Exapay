"use client";

import type { KpiPositionOption } from "@exapay/shared";
import Link from "next/link";

type Props = {
  // Template yang sedang diubah (null = template baru)
  templateId: string | null;
  positions: KpiPositionOption[];
  selected: string[];
  error?: string;
  disabled: boolean;
  onChange: (selected: string[]) => void;
};

// Daftar centang jabatan yang memakai template. Jabatan yang sedang memakai template lain ditandai —
// dicentang = dipindahkan ke template ini (satu jabatan hanya punya satu template).
export function KpiPositionPicker({ templateId, positions, selected, error, disabled, onChange }: Props) {
  if (positions.length === 0) {
    return (
      <p className="rounded-inner bg-fill-subtle px-4 py-3 text-small text-text-secondary">
        Belum ada jabatan.{" "}
        <Link href="/organization" className="font-bold text-accent-strong hover:text-accent-hover">
          Tambahkan di menu Organisasi
        </Link>
        , lalu kembali untuk memasang template ini.
      </p>
    );
  }

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...selected, id] : selected.filter((value) => value !== id));
  }

  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? "kpi-positions-error" : "kpi-positions-hint"}>
      <legend className="pb-1.5 text-[13px] font-bold text-text-primary">Dipakai oleh jabatan</legend>
      <ul className="flex flex-col rounded-field border border-border-control bg-control">
        {positions.map((position) => {
          const checked = selected.includes(position.id);
          const elsewhere = position.templateId !== null && position.templateId !== templateId;
          return (
            <li key={position.id} className="border-t border-border-subtle first:border-t-0">
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2.5 has-disabled:cursor-default">
                <input
                  type="checkbox"
                  className="size-4.5 shrink-0 accent-accent"
                  checked={checked}
                  onChange={(e) => toggle(position.id, e.target.checked)}
                  disabled={disabled}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-[14.5px] font-bold text-text-primary">{position.name}</span>
                  {elsewhere ? (
                    <span className={`text-caption ${checked ? "text-warning-text" : "text-text-tertiary"}`}>
                      {checked ? `Dipindahkan dari template ${position.templateName ?? "lain"}` : `Memakai template ${position.templateName ?? "lain"}`}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p id="kpi-positions-error" className="text-caption text-danger-text">
          {error}
        </p>
      ) : (
        <p id="kpi-positions-hint" className="text-caption text-text-tertiary">
          Karyawan di jabatan terpilih mencatat tugas harian dari indikator template ini. Satu jabatan hanya memakai satu template.
        </p>
      )}
    </fieldset>
  );
}
