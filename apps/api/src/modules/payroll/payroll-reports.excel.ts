import { BANKS, type BpjsProgram, type PayrollEmployeeSnapshot } from "@exapay/shared";
import { Decimal } from "decimal.js";
import writeXlsxFile, { type Cell, type Row, type SheetData } from "write-excel-file/node";

// File Excel laporan payroll (feature 32) — fungsi murni dari data snapshot final, tanpa I/O.
// Nominal ditulis sebagai angka (format ribuan) agar bisa dijumlah di Excel; total dijumlah dengan decimal.js.
// Nomor rekening selalu sel Teks (nol di depan & angka panjang tidak diubah Excel).

const HEADER_STYLE = { fontWeight: "bold", backgroundColor: "#FDE7D2" } as const;
const TOTAL_STYLE = { fontWeight: "bold", backgroundColor: "#F7F1EA" } as const;
const MONEY_FORMAT = "#,##0";
const TEXT_FORMAT = "@";

export type PeriodInfo = {
  companyName: string;
  // "September 2026"
  monthLabel: string;
  // "1 September 2026 – 30 September 2026"
  rangeLabel: string;
  payDateLabel: string | null;
};

function header(labels: readonly string[]): Row {
  return labels.map((value) => ({ value, ...HEADER_STYLE }));
}

function money(value: Decimal | string, style: object = {}): Cell {
  return { type: Number, value: new Decimal(value).toNumber(), format: MONEY_FORMAT, ...style };
}

function text(value: string | null, style: object = {}): Cell {
  return { type: String, value: value ?? "", ...style };
}

function sum(values: readonly string[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

function infoRows(info: PeriodInfo, title: string): SheetData {
  return [
    [{ value: `${title} — ${info.companyName}`, fontWeight: "bold", fontSize: 13 }],
    [text("Periode gaji"), text(info.monthLabel)],
    [text("Rentang absensi"), text(info.rangeLabel)],
    [text("Tanggal gajian"), text(info.payDateLabel ?? "Belum diatur")],
    [],
  ];
}

// ——— Daftar transfer bank ———

export type TransferRow = {
  fullName: string;
  employeeNumber: string | null;
  bankCode: string | null;
  // Sudah didekripsi; null = belum diisi
  accountNumber: string | null;
  accountHolder: string | null;
  // Gaji diterima (snapshot final)
  amount: string;
};

const BANK_NAMES = new Map<string, string>(BANKS.map((bank) => [bank.code, bank.name]));
const TRANSFER_COLUMNS = ["No", "Nama", "No. karyawan", "Bank", "No. rekening", "Atas nama", "Nominal", "Keterangan"];
const TRANSFER_WIDTHS = [6, 28, 14, 30, 20, 28, 16, 30];

function transferNote(row: TransferRow): string {
  const notes: string[] = [];
  if (!row.bankCode || !row.accountNumber) notes.push("Rekening belum diisi");
  else if (!row.accountHolder) notes.push("Nama pemilik rekening belum diisi");
  if (!new Decimal(row.amount).isPositive()) notes.push("Nominal nol/negatif — tidak perlu ditransfer");
  return notes.join("; ");
}

function transferSheet(rows: readonly TransferRow[]): SheetData {
  return [
    header(TRANSFER_COLUMNS),
    ...rows.map(
      (row, index): Row => [
        { type: Number, value: index + 1 },
        text(row.fullName),
        text(row.employeeNumber),
        text(row.bankCode ? (BANK_NAMES.get(row.bankCode) ?? row.bankCode) : null),
        { type: String, value: row.accountNumber ?? "", format: TEXT_FORMAT },
        text(row.accountHolder),
        money(row.amount),
        text(transferNote(row)),
      ],
    ),
    [
      text(null, TOTAL_STYLE),
      text(`Total ${rows.length} karyawan`, TOTAL_STYLE),
      ...Array.from({ length: 4 }, () => text(null, TOTAL_STYLE)),
      money(sum(rows.map((row) => row.amount)), TOTAL_STYLE),
      text(null, TOTAL_STYLE),
    ],
  ];
}

// Sheet "Semua" + satu sheet per bank (kode bank, urutan daftar bank) + "Tanpa rekening" bila ada.
// Baris tabel mulai di baris 1 agar mudah disalin ke internet banking.
export async function buildTransferWorkbook(rows: readonly TransferRow[]): Promise<Buffer> {
  const columns = TRANSFER_WIDTHS.map((width) => ({ width }));
  const sheets = [{ sheet: "Semua", data: transferSheet(rows), columns, stickyRowsCount: 1 }];
  for (const bank of BANKS) {
    const bankRows = rows.filter((row) => row.bankCode === bank.code && row.accountNumber);
    if (bankRows.length > 0) sheets.push({ sheet: bank.code, data: transferSheet(bankRows), columns, stickyRowsCount: 1 });
  }
  const missing = rows.filter((row) => !row.bankCode || !row.accountNumber);
  if (missing.length > 0) sheets.push({ sheet: "Tanpa rekening", data: transferSheet(missing), columns, stickyRowsCount: 1 });
  return writeXlsxFile(sheets).toBuffer();
}

// ——— Rekap setor: ringkasan, BPJS per karyawan, PPh 21 per karyawan ———

export type ContributionRow = {
  fullName: string;
  employeeNumber: string | null;
  // Snapshot final karyawan dihitung (result & pph21 terisi)
  snapshot: PayrollEmployeeSnapshot;
};

const PROGRAM_LABELS: Record<BpjsProgram, string> = {
  kesehatan: "BPJS Kesehatan",
  jht: "BPJS TK — JHT",
  jp: "BPJS TK — JP",
  jkk: "BPJS TK — JKK",
  jkm: "BPJS TK — JKM",
};
// Kolom per program: porsi perusahaan & karyawan (JKK/JKM ditanggung perusahaan saja)
const PROGRAM_COLUMNS: { program: BpjsProgram; side: "employer" | "employee"; label: string }[] = [
  { program: "kesehatan", side: "employer", label: "Kesehatan perusahaan" },
  { program: "kesehatan", side: "employee", label: "Kesehatan karyawan" },
  { program: "jht", side: "employer", label: "JHT perusahaan" },
  { program: "jht", side: "employee", label: "JHT karyawan" },
  { program: "jp", side: "employer", label: "JP perusahaan" },
  { program: "jp", side: "employee", label: "JP karyawan" },
  { program: "jkk", side: "employer", label: "JKK perusahaan" },
  { program: "jkm", side: "employer", label: "JKM perusahaan" },
];

function contribution(snapshot: PayrollEmployeeSnapshot, program: BpjsProgram, side: "employer" | "employee"): string {
  const line = snapshot.result?.bpjs.find((candidate) => candidate.program === program);
  if (!line) return "0";
  return side === "employer" ? line.employerAmount : line.employeeAmount;
}

function taxMethod(snapshot: PayrollEmployeeSnapshot): string {
  const tax = snapshot.pph21;
  if (!tax) return "";
  return tax.method === "ter" ? `TER kategori ${tax.terKind.slice(-1).toUpperCase()}` : "Setahun (masa pajak terakhir)";
}

export async function buildContributionsWorkbook(info: PeriodInfo, rows: readonly ContributionRow[]): Promise<Buffer> {
  const programTotals = (Object.keys(PROGRAM_LABELS) as BpjsProgram[]).map((program) => {
    const employer = sum(rows.map((row) => contribution(row.snapshot, program, "employer")));
    const employee = sum(rows.map((row) => contribution(row.snapshot, program, "employee")));
    return { program, employer, employee };
  });
  const pph21Total = sum(rows.map((row) => row.snapshot.pph21?.pph21 ?? "0"));
  const health = programTotals.filter((total) => total.program === "kesehatan");
  const employment = programTotals.filter((total) => total.program !== "kesehatan");
  const subtotal = (items: typeof programTotals, label: string): Row => {
    const employer = items.reduce((total, item) => total.plus(item.employer), new Decimal(0));
    const employee = items.reduce((total, item) => total.plus(item.employee), new Decimal(0));
    return [text(label, TOTAL_STYLE), money(employer, TOTAL_STYLE), money(employee, TOTAL_STYLE), money(employer.plus(employee), TOTAL_STYLE)];
  };

  const summary: SheetData = [
    ...infoRows(info, "Rekap setor"),
    header(["Setoran", "Perusahaan", "Karyawan (dipotong gaji)", "Total disetor"]),
    ...programTotals.map(
      (total): Row => [text(PROGRAM_LABELS[total.program]), money(total.employer), money(total.employee), money(total.employer.plus(total.employee))],
    ),
    subtotal(health, "Total BPJS Kesehatan"),
    subtotal(employment, "Total BPJS Ketenagakerjaan"),
    [],
    header(["Pajak", "", "", "Total disetor"]),
    [text("PPh 21 dipotong dari gaji"), text(null), text(null), money(pph21Total, TOTAL_STYLE)],
    [],
    [text(`${rows.length} karyawan dihitung · angka dari snapshot payroll final`)],
  ];

  const bpjsRows: SheetData = [
    header(["No", "Nama", "No. karyawan", "Upah dasar BPJS", ...PROGRAM_COLUMNS.map((column) => column.label), "Total perusahaan", "Total karyawan"]),
    ...rows.map((row, index): Row => {
      const result = row.snapshot.result;
      return [
        { type: Number, value: index + 1 },
        text(row.fullName),
        text(row.employeeNumber),
        money(result?.bpjsWage ?? "0"),
        ...PROGRAM_COLUMNS.map((column) => money(contribution(row.snapshot, column.program, column.side))),
        money(result?.bpjsEmployerTotal ?? "0"),
        money(result?.bpjsEmployeeTotal ?? "0"),
      ];
    }),
    [
      text(null, TOTAL_STYLE),
      text("Total", TOTAL_STYLE),
      text(null, TOTAL_STYLE),
      text(null, TOTAL_STYLE),
      ...PROGRAM_COLUMNS.map((column) => money(sum(rows.map((row) => contribution(row.snapshot, column.program, column.side))), TOTAL_STYLE)),
      money(sum(rows.map((row) => row.snapshot.result?.bpjsEmployerTotal ?? "0")), TOTAL_STYLE),
      money(sum(rows.map((row) => row.snapshot.result?.bpjsEmployeeTotal ?? "0")), TOTAL_STYLE),
    ],
  ];

  const pph21Rows: SheetData = [
    header(["No", "Nama", "No. karyawan", "Status PTKP", "Metode", "Tarif TER (%)", "Penghasilan bruto", "PPh 21"]),
    ...rows.map((row, index): Row => {
      const tax = row.snapshot.pph21;
      return [
        { type: Number, value: index + 1 },
        text(row.fullName),
        text(row.employeeNumber),
        text(tax?.ptkpStatus ?? null),
        text(taxMethod(row.snapshot)),
        tax?.terRatePercent ? { type: Number, value: new Decimal(tax.terRatePercent).toNumber(), format: "0.00" } : text(null),
        money(tax?.grossIncome ?? "0"),
        money(tax?.pph21 ?? "0"),
      ];
    }),
    [
      text(null, TOTAL_STYLE),
      text("Total", TOTAL_STYLE),
      ...Array.from({ length: 4 }, () => text(null, TOTAL_STYLE)),
      money(sum(rows.map((row) => row.snapshot.pph21?.grossIncome ?? "0")), TOTAL_STYLE),
      money(pph21Total, TOTAL_STYLE),
    ],
  ];

  return writeXlsxFile([
    { sheet: "Ringkasan setor", data: summary, columns: [{ width: 34 }, { width: 18 }, { width: 24 }, { width: 18 }] },
    {
      sheet: "BPJS",
      data: bpjsRows,
      columns: [{ width: 6 }, { width: 28 }, { width: 14 }, { width: 16 }, ...PROGRAM_COLUMNS.map(() => ({ width: 16 })), { width: 16 }, { width: 16 }],
      stickyRowsCount: 1,
    },
    {
      sheet: "PPh 21",
      data: pph21Rows,
      columns: [{ width: 6 }, { width: 28 }, { width: 14 }, { width: 12 }, { width: 28 }, { width: 14 }, { width: 18 }, { width: 16 }],
      stickyRowsCount: 1,
    },
  ]).toBuffer();
}
