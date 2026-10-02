"use client";

import type { RosterCell, RosterCellInput, RosterEntry, RosterWeek } from "@exapay/shared";
import { Check, CircleCheck, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { setRosterCell } from "@/actions/shiftRoster";
import { Dialog } from "@/components/common/Dialog";
import { DropdownMenu } from "@/components/common/DropdownMenu";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { firstNameOf } from "@/lib/datetime";
import { rosterDayHeader, rosterDayTitle, rosterLockLabel, shortShiftRange } from "@/lib/shiftLabels";

type Props = {
  data: RosterWeek;
};

type Employee = RosterWeek["employees"][number];
type Shift = RosterWeek["shifts"][number];
type Picked = { employee: Employee; date: string };

const GRID = "grid grid-cols-[210px_repeat(7,minmax(0,1fr))_60px] gap-2";

// Tabel roster karyawan × 7 hari (design attendance-roster): desktop = tabel kaca, klik sel → popover pilih shift / Libur /
// Kosongkan (tersimpan langsung + toast); sel terkunci → tooltip alasan. Mobile = strip 7 hari + daftar karyawan, ketuk → sheet.
// Shift dibedakan lewat teks (nama + jam) di chip netral — tanpa warna per shift.
export function RosterBoard({ data }: Props) {
  const [employees, setEmployees] = useState(data.employees);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Picked | null>(null);
  const todayIndex = data.dates.indexOf(data.today);
  const [mobileDay, setMobileDay] = useState(Math.max(0, todayIndex));
  const toastTimer = useRef<number | null>(null);

  // Data server baru (minggu/departemen lain, setelah salin) menggantikan isi lokal
  useEffect(() => {
    setEmployees(data.employees);
    setMobileDay(Math.max(0, data.dates.indexOf(data.today)));
  }, [data]);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  function showToast(next: { tone: "success" | "error"; text: string }): void {
    setToast(next);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  async function pick(employee: Employee, date: string, input: RosterCellInput): Promise<void> {
    const key = `${employee.id}|${date}`;
    setSheet(null);
    setSaving(key);
    try {
      const outcome = await setRosterCell(employee.id, date, input);
      if (outcome.kind === "error") {
        showToast({ tone: "error", text: outcome.message });
        return;
      }
      setEmployees((current) =>
        current.map((row) => {
          if (row.id !== employee.id) return row;
          const cells = row.cells.map((cell) => (cell.date === date ? outcome.cell : cell));
          return { ...row, cells, shiftCount: cells.filter((cell) => cell.entry?.kind === "shift").length };
        }),
      );
      showToast({ tone: "success", text: `Roster disimpan · ${firstNameOf(employee.fullName)} diberi tahu lewat email` });
    } catch {
      showToast({ tone: "error", text: "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." });
    } finally {
      setSaving(null);
    }
  }

  const mobileDate = data.dates[mobileDay] ?? data.today;
  const sheetCell = sheet ? sheet.employee.cells.find((cell) => cell.date === sheet.date) : undefined;

  return (
    <>
      {/* Desktop */}
      <div className="glass-data hidden rounded-card lg:block">
        <div className={`${GRID} h-12 items-stretch rounded-t-card border-b border-border-subtle bg-table-head px-4`}>
          <span className="self-center text-caption font-bold text-text-secondary">Karyawan</span>
          {data.dates.map((date) => {
            const head = rosterDayHeader(date);
            const today = date === data.today;
            return (
              <span
                key={date}
                className={`flex items-center justify-center text-[13px] tabular-nums ${today ? "font-bold text-text-primary shadow-[inset_0_-2px_0_var(--color-accent)]" : "font-medium text-text-secondary"}`}
              >
                {head.weekday} {head.day}
              </span>
            );
          })}
          <span />
        </div>
        <ul>
          {employees.map((employee) => (
            <li key={employee.id} className={`${GRID} min-h-18 items-center border-t border-border-subtle/90 px-4 py-2 first:border-t-0`}>
              <div className="flex min-w-0 items-center gap-3">
                <EmployeeAvatar fullName={employee.fullName} />
                <div className="flex min-w-0 flex-col gap-px">
                  <span className="truncate text-[14.5px] font-bold text-text-primary">{employee.fullName}</span>
                  <span className="truncate text-caption text-text-tertiary">{employee.positionName}</span>
                </div>
              </div>
              {employee.cells.map((cell) => {
                const key = `${employee.id}|${cell.date}`;
                const label = `${employee.fullName}, ${rosterDayTitle(cell.date)}`;
                if (cell.lock) {
                  return (
                    <div key={cell.date} className="relative">
                      <button
                        type="button"
                        aria-label={`${label} — ${rosterLockLabel(cell.lock)}`}
                        onClick={() => setTip((current) => (current === key ? null : key))}
                        onBlur={() => setTip(null)}
                        className="w-full rounded-[12px] text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                      >
                        <ShiftChip entry={cell.entry} locked />
                      </button>
                      {tip === key ? (
                        <span
                          role="tooltip"
                          className="absolute bottom-[calc(100%+6px)] left-1/2 z-20 -translate-x-1/2 rounded-[10px] bg-inverse px-2.75 py-1.75 text-[12.5px] font-medium whitespace-nowrap text-on-inverse"
                        >
                          {rosterLockLabel(cell.lock)}
                        </span>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <DropdownMenu
                    key={cell.date}
                    label={label}
                    panelClassName="w-59"
                    triggerClassName="block w-full rounded-[12px] text-left"
                    trigger={<ShiftChip entry={cell.entry} saving={saving === key} interactive />}
                  >
                    {(close) => (
                      <RosterOptions
                        title={rosterDayTitle(cell.date)}
                        cell={cell}
                        shifts={data.shifts}
                        onPick={(input) => {
                          close();
                          void pick(employee, cell.date, input);
                        }}
                      />
                    )}
                  </DropdownMenu>
                );
              })}
              <span className="text-right text-[13px] text-text-secondary tabular-nums">{employee.shiftCount} shift</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-3.5 lg:hidden">
        <div role="tablist" aria-label="Tanggal" className="grid grid-cols-7 gap-1 rounded-[20px] bg-segment-track p-1">
          {data.dates.map((date, index) => {
            const head = rosterDayHeader(date);
            const active = index === mobileDay;
            return (
              <button
                key={date}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMobileDay(index)}
                className={`flex h-13 flex-col items-center justify-center gap-px rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${active ? "bg-surface-solid text-text-primary shadow-segment" : "text-text-secondary"}`}
              >
                <span className="text-[11.5px]">{head.weekday}</span>
                <span className={`font-display text-[15px] tabular-nums ${active || date === data.today ? "font-bold" : "font-medium"}`}>{head.day}</span>
              </button>
            );
          })}
        </div>
        <ul className="glass-data rounded-card px-4">
          {employees.map((employee) => {
            const cell = employee.cells.find((candidate) => candidate.date === mobileDate);
            if (!cell) return null;
            const key = `${employee.id}|${cell.date}`;
            return (
              <li key={employee.id} className="flex min-h-17 items-center gap-3 border-t border-border-subtle/90 first:border-t-0">
                <EmployeeAvatar fullName={employee.fullName} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14.5px] font-bold text-text-primary">{employee.fullName}</span>
                  <span className="truncate text-caption text-text-tertiary">{cell.lock ? rosterLockLabel(cell.lock) : employee.positionName}</span>
                </div>
                <button
                  type="button"
                  disabled={cell.lock !== null}
                  aria-label={`${employee.fullName}, ${rosterDayTitle(cell.date)}`}
                  onClick={() => setSheet({ employee, date: cell.date })}
                  className="w-26 shrink-0 rounded-[12px] text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45"
                >
                  <ShiftChip entry={cell.entry} locked={cell.lock !== null} saving={saving === key} interactive={cell.lock === null} compact />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {sheet && sheetCell ? (
        <Dialog open onClose={() => setSheet(null)} title={sheet.employee.fullName} description={rosterDayTitle(sheet.date, true)}>
          <div className="-mx-2 flex flex-col gap-1">
            <RosterOptions cell={sheetCell} shifts={data.shifts} onPick={(input) => void pick(sheet.employee, sheet.date, input)} large />
            <p className="px-2.5 pt-1.5 text-caption text-text-tertiary">Tersimpan langsung. {firstNameOf(sheet.employee.fullName)} diberi tahu lewat email.</p>
          </div>
        </Dialog>
      ) : null}

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2.5 rounded-full bg-inverse px-4.5 py-3 text-sm font-medium text-on-inverse shadow-overlay"
        >
          {toast.tone === "success" ? <CircleCheck aria-hidden className="size-4.25 shrink-0" /> : null}
          <span className="text-pretty">{toast.text}</span>
        </div>
      ) : null}
    </>
  );
}

// Chip sel roster (design attendance-roster "ShiftChip"): shift = latar netral + nama & jam pendek; libur = teks redup;
// kosong = garis putus "—"; terkunci = gembok + 55%; menyimpan = spinner
function ShiftChip(props: { entry: RosterEntry | null; locked?: boolean; saving?: boolean; interactive?: boolean; compact?: boolean }) {
  const { entry, locked = false, saving = false, interactive = false, compact = false } = props;
  const surface =
    entry === null ? "border border-dashed border-border-outline" : entry.kind === "shift" ? "border border-transparent bg-segment-track" : "border border-border-subtle";
  return (
    <span
      className={`relative flex flex-col items-start justify-center gap-px rounded-[12px] px-2.5 py-1.75 text-text-primary ${compact ? "min-h-12" : "min-h-13"} ${surface} ${locked ? "opacity-55" : ""} ${interactive ? "transition-colors hover:border-accent/60" : ""}`}
    >
      {saving ? (
        <span className="flex items-center gap-1.5 text-caption text-text-secondary">
          <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-border-outline border-t-text-primary" />
          Menyimpan…
        </span>
      ) : entry === null ? (
        <span className="text-sm text-text-muted">—</span>
      ) : entry.kind === "off" ? (
        <span className="text-[13px] font-medium text-text-tertiary">Libur</span>
      ) : (
        <>
          <span className="text-[13px] font-bold">{entry.name}</span>
          <span className="text-caption text-text-secondary tabular-nums">{shortShiftRange(entry.startTime, entry.endTime)}</span>
        </>
      )}
      {locked ? <Lock aria-hidden className="absolute top-1.75 right-2 size-3 text-text-tertiary" /> : null}
    </span>
  );
}

// Pilihan shift / Libur / Kosongkan (popover desktop & sheet mobile); pilihan aktif dicentang
function RosterOptions(props: { title?: string; cell: RosterCell; shifts: readonly Shift[]; onPick: (input: RosterCellInput) => void; large?: boolean }) {
  const { title, cell, shifts, onPick, large = false } = props;
  const height = large ? "min-h-13" : "h-11";
  const option = (key: string, label: string, time: string | null, active: boolean, input: RosterCellInput, separated = false) => (
    <button
      key={key}
      type="button"
      onClick={() => onPick(input)}
      className={`flex ${height} w-full items-center gap-2.5 rounded-[12px] px-2.5 text-left text-text-primary transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/45 ${separated ? "mt-1 border-t border-border-subtle pt-1" : ""}`}
    >
      <span className="flex flex-1 items-baseline gap-2">
        <span className={`text-sm ${active ? "font-bold" : "font-medium"}`}>{label}</span>
        {time ? <span className="text-caption text-text-secondary tabular-nums">{time}</span> : null}
      </span>
      <Check aria-hidden className={`size-4 shrink-0 ${active ? "text-accent-strong" : "invisible"}`} />
    </button>
  );
  const current = cell.entry;
  return (
    <>
      {title ? <span className="px-2.5 pt-1 pb-1.5 text-caption text-text-secondary">{title}</span> : null}
      {shifts.map((shift) =>
        option(
          shift.id,
          shift.name,
          `${shift.startTime}–${shift.endTime}${shift.overnight ? " (+1)" : ""}`,
          current?.kind === "shift" && current.shiftId === shift.id,
          { kind: "shift", shiftId: shift.id },
        ),
      )}
      {option("off", "Libur", null, current?.kind === "off", { kind: "off" }, true)}
      {option("clear", "Kosongkan", null, false, { kind: "clear" })}
    </>
  );
}
