import { readFileSync } from "node:fs";

import {
  type ComplianceDeadlineKind,
  type ComplianceDeadlineRule,
  type ComplianceEmployee,
  complianceReminderKeySchema,
  complianceRemindersBetween,
  type ComplianceSource,
  findComplianceReminder,
} from "@exapay/shared";
import { describe, expect, it } from "vitest";

// Generator pengingat kalender kepatuhan (feature 33) — fungsi murni yang dipakai API & worker.
// Aturan tenggat dibaca dari seed migration 0028 agar test memeriksa data yang benar-benar dipakai.

function seedRules(): ComplianceDeadlineRule[] {
  const sql = readFileSync(new URL("../../../packages/db/migrations/0028_compliance_calendar.sql", import.meta.url), "utf8");
  const pattern = /\('(bpjs_kesehatan|bpjs_ketenagakerjaan|pph21_payment|pph21_report)', (\d+), (\d+), '([0-9-]{10})', (NULL|'[0-9-]{10}')/g;
  const rules = [...sql.matchAll(pattern)].map(
    (match): ComplianceDeadlineRule => ({
      kind: match[1] as ComplianceDeadlineKind, // dibatasi regex ke 4 jenis yang valid
      dueDay: Number(match[2]),
      monthOffset: Number(match[3]),
      effectiveFrom: match[4] ?? "",
      effectiveTo: match[5] === "NULL" ? null : (match[5] ?? "").slice(1, -1),
    }),
  );
  expect(rules).toHaveLength(6);
  return rules;
}

const RULES = seedRules();

function employee(overrides: Partial<ComplianceEmployee> & { id: string }): ComplianceEmployee {
  return {
    fullName: `Karyawan ${overrides.id.slice(0, 4)}`,
    employmentStatus: "permanent",
    joinDate: "2024-01-01",
    endDate: null,
    contractEndDate: null,
    probationEndDate: null,
    ...overrides,
  };
}

const ANDI = "11111111-1111-4111-8111-111111111111";
const BUDI = "22222222-2222-4222-8222-222222222222";
const CITRA = "33333333-3333-4333-8333-333333333333";

function source(employees: ComplianceEmployee[], since = "2024-01-01"): ComplianceSource {
  return { rules: RULES, employees, since };
}

function keysWithDates(items: ReturnType<typeof complianceRemindersBetween>): string[] {
  return items.map((item) => `${item.dueDate} ${item.key}`);
}

describe("tenggat berkala", () => {
  it("Oktober 2026: BPJS Kesehatan masa Okt tgl 10, BPJS TK & PPh 21 masa Sep tgl 15, lapor tgl 20", () => {
    const items = complianceRemindersBetween(source([employee({ id: ANDI })]), "2026-10-01", "2026-10-31");
    expect(keysWithDates(items)).toEqual([
      "2026-10-10 bpjs_kesehatan:2026-10",
      "2026-10-15 bpjs_ketenagakerjaan:2026-09",
      "2026-10-15 pph21_payment:2026-09",
      "2026-10-20 pph21_report:2026-09",
    ]);
  });

  it("PPh 21 masa Desember 2024 memakai aturan lama (setor tgl 10), masa Januari 2025 aturan PMK 81/2024 (tgl 15)", () => {
    const items = complianceRemindersBetween(source([employee({ id: ANDI })]), "2025-01-01", "2025-02-28");
    const pph = items.filter((item) => item.kind === "pph21_payment" || item.kind === "pph21_report");
    expect(keysWithDates(pph)).toEqual([
      "2025-01-10 pph21_payment:2024-12",
      "2025-01-20 pph21_report:2024-12",
      "2025-02-15 pph21_payment:2025-01",
      "2025-02-20 pph21_report:2025-01",
    ]);
  });

  it("hanya masa yang punya karyawan aktif; tenggat sebelum usaha terdaftar tidak diingatkan", () => {
    // Masuk 15 Okt 2026 → masa Okt ada, masa Sep tidak
    const joined = complianceRemindersBetween(source([employee({ id: ANDI, joinDate: "2026-10-15" })]), "2026-10-01", "2026-11-30");
    expect(joined.map((item) => item.key)).toEqual([
      "bpjs_kesehatan:2026-10",
      "bpjs_kesehatan:2026-11",
      "bpjs_ketenagakerjaan:2026-10",
      "pph21_payment:2026-10",
      "pph21_report:2026-10",
    ]);
    // Keluar 31 Agu 2026 → masa Sep & Okt kosong
    expect(complianceRemindersBetween(source([employee({ id: ANDI, endDate: "2026-08-31" })]), "2026-10-01", "2026-10-31")).toEqual([]);
    // Usaha terdaftar 12 Okt 2026 → BPJS Kesehatan 10 Okt tidak diingatkan, tenggat masa Sep sesudahnya tetap
    const fresh = complianceRemindersBetween(source([employee({ id: ANDI })], "2026-10-12"), "2026-10-01", "2026-10-31");
    expect(fresh.map((item) => item.key)).toEqual(["bpjs_ketenagakerjaan:2026-09", "pph21_payment:2026-09", "pph21_report:2026-09"]);
    // Tanpa karyawan → tidak ada pengingat
    expect(complianceRemindersBetween(source([]), "2026-10-01", "2026-10-31")).toEqual([]);
  });

  it("hari tenggat di bulan pendek memakai hari terakhir bulan itu", () => {
    const rules: ComplianceDeadlineRule[] = [{ kind: "pph21_report", dueDay: 31, monthOffset: 1, effectiveFrom: "2024-01-01", effectiveTo: null }];
    const items = complianceRemindersBetween({ rules, employees: [employee({ id: ANDI })], since: "2024-01-01" }, "2026-02-01", "2026-02-28");
    expect(keysWithDates(items)).toEqual(["2026-02-28 pph21_report:2026-01"]);
  });
});

describe("kontrak & masa percobaan", () => {
  const staff = [
    employee({ id: ANDI, fullName: "Andi", employmentStatus: "contract", contractEndDate: "2026-10-20" }),
    employee({ id: BUDI, fullName: "Budi", employmentStatus: "probation", probationEndDate: "2026-10-20" }),
    // Tetap — tanggal kontrak lama tidak diingatkan lagi
    employee({ id: CITRA, fullName: "Citra", employmentStatus: "permanent", contractEndDate: "2026-10-20" }),
  ];

  it("pengingat dari status kerja saat ini, urut tanggal → jenis → nama", () => {
    const items = complianceRemindersBetween(source(staff), "2026-10-16", "2026-10-31");
    expect(keysWithDates(items)).toEqual([
      "2026-10-20 pph21_report:2026-09",
      `2026-10-20 contract_end:${ANDI}:2026-10-20`,
      `2026-10-20 probation_end:${BUDI}:2026-10-20`,
    ]);
    expect(items[1]?.employee).toEqual({ id: ANDI, fullName: "Andi" });
  });

  it("karyawan yang keluar pada/sebelum tanggal itu tidak diingatkan", () => {
    const ended = [employee({ id: ANDI, employmentStatus: "contract", contractEndDate: "2026-10-20", endDate: "2026-10-20" })];
    expect(complianceRemindersBetween(source(ended), "2026-10-20", "2026-10-20").filter((item) => item.employee)).toEqual([]);
  });
});

describe("kunci pengingat", () => {
  it("findComplianceReminder menemukan pengingat yang berlaku; tanggal kontrak berubah → kunci lama tidak berlaku", () => {
    const before = source([employee({ id: ANDI, employmentStatus: "contract", contractEndDate: "2026-10-20" })]);
    expect(findComplianceReminder(before, "pph21_payment:2026-09")?.dueDate).toBe("2026-10-15");
    expect(findComplianceReminder(before, "bpjs_kesehatan:2026-10")?.dueDate).toBe("2026-10-10");
    expect(findComplianceReminder(before, `contract_end:${ANDI}:2026-10-20`)?.kind).toBe("contract_end");

    const renewed = source([employee({ id: ANDI, employmentStatus: "contract", contractEndDate: "2027-04-20" })]);
    expect(findComplianceReminder(renewed, `contract_end:${ANDI}:2026-10-20`)).toBeNull();
    expect(findComplianceReminder(renewed, `contract_end:${ANDI}:2027-04-20`)?.dueDate).toBe("2027-04-20");
    // Tenggat sebelum usaha terdaftar / jenis tertukar → tidak ada
    expect(findComplianceReminder(source([employee({ id: ANDI })], "2026-10-16"), "pph21_payment:2026-09")).toBeNull();
    expect(findComplianceReminder(before, `probation_end:${ANDI}:2026-10-20`)).toBeNull();
  });

  it("validasi format kunci", () => {
    expect(complianceReminderKeySchema.safeParse("bpjs_kesehatan:2026-10").success).toBe(true);
    expect(complianceReminderKeySchema.safeParse(`contract_end:${ANDI}:2026-10-20`).success).toBe(true);
    expect(complianceReminderKeySchema.safeParse("bpjs_kesehatan:2026-13").success).toBe(false);
    expect(complianceReminderKeySchema.safeParse(`contract_end:${ANDI}:2026-02-30`).success).toBe(false);
    expect(complianceReminderKeySchema.safeParse("contract_end:2026-10").success).toBe(false);
    expect(complianceReminderKeySchema.safeParse("lainnya:2026-10").success).toBe(false);
  });
});
