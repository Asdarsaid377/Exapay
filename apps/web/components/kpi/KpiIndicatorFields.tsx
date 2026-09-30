"use client";

import { KPI_INDICATOR_TYPES, KPI_TARGET_PERIODS, KPI_UNIT_MAX, type KpiIndicatorType } from "@exapay/shared";
import { Trash2 } from "lucide-react";

import { SelectField } from "@/components/common/SelectField";
import { TextField } from "@/components/common/TextField";
import {
  DEFAULT_ATTENDANCE_TARGET,
  INDICATOR_TYPE_HINTS,
  INDICATOR_TYPE_LABELS,
  type IndicatorDraft,
  sanitizeTargetInput,
  TARGET_PERIOD_LABELS,
} from "@/lib/kpiTemplateLabels";

export type IndicatorField = "name" | "type" | "unit" | "target" | "targetPeriod" | "weight";
export type IndicatorErrors = Partial<Record<IndicatorField, string>>;

type Props = {
  index: number;
  indicator: IndicatorDraft;
  errors: IndicatorErrors;
  disabled: boolean;
  // null = tidak bisa dihapus (indikator terakhir)
  onRemove: (() => void) | null;
  onChange: (patch: Partial<IndicatorDraft>) => void;
};

// Akhiran satuan di dalam input (bukan ikon hiasan)
const SUFFIX = (
  <span aria-hidden className="pointer-events-none pr-2 text-body text-text-secondary">
    %
  </span>
);

// Satu indikator di editor template: nama, tipe, bobot, lalu isian target sesuai tipe
export function KpiIndicatorFields({ index, indicator, errors, disabled, onRemove, onChange }: Props) {
  const id = `indicator-${indicator.key}`;
  const number = index + 1;

  function changeType(type: KpiIndicatorType) {
    // Target berbeda makna antar tipe — kosongkan, kecuali kehadiran yang punya nilai lazim
    onChange({ type, target: type === "system" ? DEFAULT_ATTENDANCE_TARGET : type === "count" || type === "numeric" ? indicator.target : "" });
  }

  return (
    <li className="flex flex-col gap-4 border-t border-border-subtle py-5 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold text-text-primary">Indikator {number}</h3>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Hapus indikator ${number}${indicator.name ? ` (${indicator.name})` : ""}`}
            className="grid size-10 place-items-center rounded-field text-text-secondary transition-colors hover:bg-danger/8 hover:text-danger-text focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 disabled:text-text-muted"
          >
            <Trash2 aria-hidden className="size-4.5" />
          </button>
        ) : null}
      </div>

      <TextField
        id={`${id}-name`}
        label="Nama indikator"
        requiredMark
        placeholder="mis. Transaksi dilayani"
        maxLength={80}
        value={indicator.name}
        onChange={(e) => onChange({ name: e.target.value })}
        error={errors.name}
        disabled={disabled}
      />

      <div className="grid gap-x-4 gap-y-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SelectField
          id={`${id}-type`}
          label="Tipe"
          value={indicator.type}
          onChange={(e) => {
            const type = KPI_INDICATOR_TYPES.find((value) => value === e.target.value);
            if (type) changeType(type);
          }}
          error={errors.type}
          hint={INDICATOR_TYPE_HINTS[indicator.type]}
          disabled={disabled}
        >
          {KPI_INDICATOR_TYPES.map((type) => (
            <option key={type} value={type}>
              {INDICATOR_TYPE_LABELS[type]}
            </option>
          ))}
        </SelectField>
        <TextField
          id={`${id}-weight`}
          label="Bobot"
          requiredMark
          inputMode="numeric"
          placeholder="0"
          value={indicator.weight}
          onChange={(e) => onChange({ weight: e.target.value.replace(/[^0-9]/g, "").slice(0, 3) })}
          error={errors.weight}
          trailing={SUFFIX}
          disabled={disabled}
          className="tabular-nums"
        />
      </div>

      {indicator.type === "numeric" || indicator.type === "count" ? (
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
          <TextField
            id={`${id}-target`}
            label="Target"
            requiredMark
            inputMode={indicator.type === "numeric" ? "decimal" : "numeric"}
            placeholder="0"
            value={indicator.target}
            onChange={(e) => onChange({ target: sanitizeTargetInput(e.target.value, indicator.type === "numeric") })}
            error={errors.target}
            disabled={disabled}
            className="tabular-nums"
          />
          <TextField
            id={`${id}-unit`}
            label="Satuan"
            requiredMark
            placeholder={indicator.type === "numeric" ? "mis. Rp, kg" : "mis. transaksi"}
            maxLength={KPI_UNIT_MAX}
            value={indicator.unit}
            onChange={(e) => onChange({ unit: e.target.value })}
            error={errors.unit}
            disabled={disabled}
          />
          <SelectField
            id={`${id}-period`}
            label="Waktu target"
            value={indicator.targetPeriod}
            onChange={(e) => {
              const period = KPI_TARGET_PERIODS.find((value) => value === e.target.value);
              if (period) onChange({ targetPeriod: period });
            }}
            error={errors.targetPeriod}
            disabled={disabled}
          >
            {KPI_TARGET_PERIODS.map((period) => (
              <option key={period} value={period}>
                {TARGET_PERIOD_LABELS[period]}
              </option>
            ))}
          </SelectField>
        </div>
      ) : null}

      {indicator.type === "system" ? (
        <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
          <TextField
            id={`${id}-target`}
            label="Target kehadiran"
            requiredMark
            inputMode="numeric"
            placeholder="95"
            value={indicator.target}
            onChange={(e) => onChange({ target: sanitizeTargetInput(e.target.value, false) })}
            error={errors.target}
            hint="Persen hari hadir dari hari kerja."
            trailing={SUFFIX}
            disabled={disabled}
            className="tabular-nums"
          />
        </div>
      ) : null}
    </li>
  );
}
