import type { MembershipRole } from "@exapay/shared";
import { useId } from "react";

import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roleLabels";

type Props = {
  legend: string;
  roles: readonly MembershipRole[];
  value: MembershipRole | null;
  onChange: (role: MembershipRole) => void;
  error?: string;
  disabled?: boolean;
};

// Pilihan peran sebagai kartu radio berisi penjelasan singkat — pengundang tahu akses yang diberikan.
// Nama grup dari useId: component yang sama bisa ada dua kali di DOM (baris tabel desktop + mobile),
// grup radio bernama sama saling menimpa status checked.
export function RoleOptions({ legend, roles, value, onChange, error, disabled }: Props) {
  const name = useId();
  const errorId = `${name}-error`;
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? errorId : undefined} disabled={disabled}>
      <legend className="mb-1.5 text-[13px] font-bold text-text-primary">{legend}</legend>
      <div className="flex flex-col gap-2">
        {roles.map((role) => (
          <label
            key={role}
            className={`flex cursor-pointer items-start gap-3 rounded-field border bg-control px-3.5 py-3 transition-[border-color,background-color,box-shadow] hover:border-border-control-hover has-checked:border-accent has-checked:bg-accent/10 has-focus-visible:ring-3 has-focus-visible:ring-accent/45 has-disabled:cursor-default has-disabled:opacity-60 ${
              error ? "border-danger" : "border-border-control"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={role}
              checked={value === role}
              onChange={() => onChange(role)}
              className="mt-0.5 size-4.5 shrink-0 accent-accent-strong focus-visible:outline-none"
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-bold text-text-primary">{ROLE_LABELS[role]}</span>
              <span className="text-small text-text-secondary">{ROLE_DESCRIPTIONS[role]}</span>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id={errorId} className="text-caption text-danger-text">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
