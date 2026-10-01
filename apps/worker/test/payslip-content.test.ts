import { type PayrollEmployeeSnapshot, payrollEmployeeSnapshotSchema } from "@exapay/shared";
import { describe, expect, it } from "vitest";

import { buildPayslipContent, PayslipContentError, type PayslipSource } from "../src/payslips/payslip-content.js";
import { renderPayslipPdf } from "../src/payslips/payslip-pdf.js";

// Snapshot final satu karyawan (bentuk payroll_run_employees.snapshot): gaji pokok 5 jt + tunj. jabatan 500 rb +
// tunj. kehadiran 300 rb (berkurang 100 rb) − alpa 200 rb → bruto 5,5 jt; BPJS Kes 55 rb + JHT 110 rb + cicilan 250 rb;
// PPh 21 30 rb → diterima 5.055.000
function snapshot(overrides: { pph21?: string; takeHomePay?: string } = {}): PayrollEmployeeSnapshot {
  return payrollEmployeeSnapshotSchema.parse({
    employee: {
      id: "7f1c1f8e-6a43-4c1b-9a51-0d1f3c2b4a10",
      fullName: "Dewi Lestari",
      employeeNumber: "KN-007",
      positionName: "Barista",
      departmentName: "Operasional",
      joinDate: "2025-01-06",
      endDate: null,
      ptkpStatus: "TK/0",
    },
    status: "calculated",
    message: null,
    salary: null,
    adjustments: [],
    attendanceFacts: { periodWorkingDays: 22, employedWorkingDays: 22, absentDays: 1, lateMinutes: [12], permitDays: 0, sickDays: 0, undocumentedPermitSickDays: 0 },
    attendanceWaived: false,
    result: {
      earnings: [
        { code: "c1", name: "Gaji Pokok", kind: "base_salary", amount: "5000000.00" },
        { code: "c2", name: "Tunjangan Jabatan", kind: "fixed_allowance", amount: "500000.00" },
        { code: "c3", name: "Tunjangan Kehadiran", kind: "attendance_allowance", amount: "300000.00" },
      ],
      deductions: [{ code: "c4", name: "Cicilan Pinjaman", kind: "deduction", amount: "250000.00" }],
      proration: null,
      baseSalary: "5000000.00",
      fixedAllowances: "500000.00",
      variableAllowances: "0.00",
      attendanceAllowance: "300000.00",
      attendanceAllowancePaid: "200000.00",
      attendance: {
        lines: [
          { kind: "absence", amount: "200000.00", steps: [] },
          { kind: "late", amount: "0.00", steps: [] },
          { kind: "attendance_allowance", amount: "100000.00", steps: [] },
        ],
        totalDeduction: "200000.00",
        attendanceAllowancePaid: "200000.00",
      },
      attendanceDeductionTotal: "200000.00",
      grossPay: "5500000.00",
      bpjsWage: "5500000.00",
      bpjs: [
        { program: "kesehatan", jkkRiskLevel: null, contributionBase: "5500000.00", employerRatePercent: "4.0000", employeeRatePercent: "1.0000", employerAmount: "220000.00", employeeAmount: "55000.00", steps: [] },
        { program: "jht", jkkRiskLevel: null, contributionBase: "5500000.00", employerRatePercent: "3.7000", employeeRatePercent: "2.0000", employerAmount: "203500.00", employeeAmount: "110000.00", steps: [] },
        { program: "jkm", jkkRiskLevel: null, contributionBase: "5500000.00", employerRatePercent: "0.3000", employeeRatePercent: "0.0000", employerAmount: "16500.00", employeeAmount: "0.00", steps: [] },
      ],
      bpjsEmployerTotal: "440000.00",
      bpjsEmployeeTotal: "165000.00",
      otherDeductionsTotal: "250000.00",
      totalDeductions: "415000.00",
      netPay: "5085000.00",
      steps: [],
      warnings: [],
    },
    pph21: {
      method: "ter",
      ptkpStatus: "TK/0",
      terKind: "ter_a",
      grossIncome: "5736000.00",
      terRatePercent: "0.5000",
      annual: null,
      pph21: overrides.pph21 ?? "30000.00",
      steps: [],
      warnings: [],
    },
    takeHomePay: overrides.takeHomePay ?? "5055000.00",
    warnings: [],
  });
}

function source(employee: PayrollEmployeeSnapshot): PayslipSource {
  return {
    company: { name: "Kopi Nusantara", address: "Jl. Merdeka 10, Bandung" },
    period: { month: "2026-10", periodStart: "2026-09-26", periodEnd: "2026-10-25", payDate: "2026-10-28" },
    employee,
    generatedOn: "2026-10-26",
  };
}

describe("buildPayslipContent", () => {
  it("menyusun pendapatan, potongan, dan gaji diterima dari snapshot", () => {
    const content = buildPayslipContent(source(snapshot()));
    expect(content.monthLabel).toBe("Oktober 2026");
    expect(content.earnings.lines.map((line) => [line.label, line.amount])).toEqual([
      ["Gaji Pokok", "Rp 5.000.000"],
      ["Tunjangan Jabatan", "Rp 500.000"],
      ["Tunjangan Kehadiran", "Rp 300.000"],
      // Baris absensi Rp 0 (telat) tidak ditampilkan
      ["Potongan alpa", "-Rp 200.000"],
      ["Tunjangan kehadiran berkurang", "-Rp 100.000"],
    ]);
    expect(content.earnings.total).toBe("Rp 5.500.000");
    // Iuran karyawan Rp 0 (JKM) tidak ditampilkan
    expect(content.deductions.lines.map((line) => [line.label, line.amount])).toEqual([
      ["BPJS Kesehatan", "Rp 55.000"],
      ["BPJS TK - Jaminan Hari Tua", "Rp 110.000"],
      ["Cicilan Pinjaman", "Rp 250.000"],
      ["PPh 21", "Rp 30.000"],
    ]);
    expect(content.deductions.total).toBe("Rp 445.000");
    expect(content.takeHomePay).toBe("Rp 5.055.000");
    expect(content.employerContributions?.total).toBe("Rp 440.000");
    expect(content.details).toContainEqual({ label: "Periode absensi", value: "26 September 2026 - 25 Oktober 2026" });
    expect(content.notes[0]).toContain("22 hari kerja");
  });

  it("PPh 21 negatif tampil sebagai pengembalian", () => {
    const content = buildPayslipContent(source(snapshot({ pph21: "-45000.00", takeHomePay: "5130000.00" })));
    expect(content.deductions.lines.at(-1)).toMatchObject({ label: "Pengembalian kelebihan PPh 21", amount: "-Rp 45.000" });
    expect(content.deductions.total).toBe("Rp 370.000");
    expect(content.takeHomePay).toBe("Rp 5.130.000");
  });

  it("menolak snapshot yang total-nya tidak cocok", () => {
    expect(() => buildPayslipContent(source(snapshot({ takeHomePay: "5055001.00" })))).toThrow(PayslipContentError);
  });

  it("merender PDF", async () => {
    const pdf = await renderPayslipPdf(buildPayslipContent(source(snapshot())), { title: "Slip gaji Oktober 2026", author: "Kopi Nusantara" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
