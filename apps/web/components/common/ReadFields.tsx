import type { ReactNode } from "react";

export type ReadField = { label: string; value: ReactNode; wide?: boolean; masked?: boolean };

type Props = {
  fields: ReadField[];
};

// Daftar label–nilai hanya baca (design-tokens "read-field"): label kecil text-tertiary + nilai 15px medium.
// Dipakai detail karyawan (/employees/[id]) dan profil portal (/me/profile).
export function ReadFields({ fields }: Props) {
  return (
    <dl className="grid gap-x-6 gap-y-5.5 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.label} className={`flex min-w-0 flex-col gap-1.25 ${field.wide ? "sm:col-span-2" : ""}`}>
          <dt className="text-[13px] text-text-tertiary">{field.label}</dt>
          <dd className={`flex min-h-6 flex-wrap items-center gap-2 text-[15px] font-medium text-text-primary tabular-nums ${field.masked ? "tracking-[0.04em]" : ""}`}>
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
