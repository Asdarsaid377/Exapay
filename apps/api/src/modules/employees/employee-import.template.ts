import { BANKS, EMPLOYEE_IMPORT_COLUMNS, EMPLOYEE_IMPORT_MAX_ROWS, EMPLOYEE_IMPORT_SHEET, type EmployeeImportColumnKey, PTKP_STATUSES } from "@exapay/shared";
import writeXlsxFile, { type Row, type SheetData } from "write-excel-file/node";

// Template impor karyawan (feature 12): sheet Karyawan (judul kolom + sel siap isi), Petunjuk, Referensi.
// Dropdown (data validation Excel) tidak didukung write-excel-file — disisipkan ke XML sheet lewat `features`.

const REFERENCE_SHEET = "Referensi";
const TEXT_FORMAT = "@";
const DATE_FORMAT = "dd/mm/yyyy";
const HEADER_STYLE = { fontWeight: "bold", backgroundColor: "#FDE7D2" } as const;

// Sel Teks: angka panjang & angka 0 di depan tidak diubah Excel
const TEXT_COLUMNS: EmployeeImportColumnKey[] = ["employeeNumber", "phone", "nik", "npwp", "bankAccountNumber"];
const DATE_COLUMNS: EmployeeImportColumnKey[] = ["birthDate", "joinDate", "contractEndDate", "probationEndDate"];
const WIDTHS: Partial<Record<EmployeeImportColumnKey, number>> = {
  fullName: 28,
  email: 26,
  department: 20,
  position: 20,
  supervisor: 24,
  nik: 20,
  npwp: 20,
  bankAccountNumber: 18,
  bankAccountHolder: 26,
};

export type TemplateReferences = { departments: string[]; positions: string[] };

export async function buildImportTemplate(references: TemplateReferences): Promise<Buffer> {
  const header: Row = EMPLOYEE_IMPORT_COLUMNS.map((column) => ({ value: column.required ? `${column.header} *` : column.header, ...HEADER_STYLE }));
  const blankRow: Row = EMPLOYEE_IMPORT_COLUMNS.map((column) => {
    if (TEXT_COLUMNS.includes(column.key)) return { type: String, value: "", format: TEXT_FORMAT };
    if (DATE_COLUMNS.includes(column.key)) return { type: Date, value: undefined, format: DATE_FORMAT };
    return null;
  });
  const employeesSheet: SheetData = [header, ...Array.from({ length: EMPLOYEE_IMPORT_MAX_ROWS }, () => blankRow)];

  const referenceRows = Math.max(references.departments.length, references.positions.length, BANKS.length);
  const referenceSheet: SheetData = [
    [
      { value: "Departemen", ...HEADER_STYLE },
      { value: "Jabatan", ...HEADER_STYLE },
      { value: "Kode bank", ...HEADER_STYLE },
      { value: "Nama bank", ...HEADER_STYLE },
    ],
    ...Array.from({ length: referenceRows }, (_, index): Row => [
      references.departments[index] ?? null,
      references.positions[index] ?? null,
      BANKS[index]?.code ?? null,
      BANKS[index]?.name ?? null,
    ]),
  ];

  const validations = [
    listFromSheet("department", "A", references.departments.length),
    listFromSheet("position", "B", references.positions.length),
    listFromSheet("bank", "C", BANKS.length),
    inlineList("gender", ["L", "P"]),
    inlineList("employmentStatus", ["Tetap", "Kontrak", "Percobaan"]),
    inlineList("ptkpStatus", [...PTKP_STATUSES]),
  ].filter((item): item is string => item !== null);

  return writeXlsxFile(
    [
      {
        sheet: EMPLOYEE_IMPORT_SHEET,
        data: employeesSheet,
        columns: EMPLOYEE_IMPORT_COLUMNS.map((column) => ({ width: WIDTHS[column.key] ?? 18 })),
        stickyRowsCount: 1,
      },
      { sheet: "Petunjuk", data: instructions(), columns: [{ width: 24 }, { width: 90 }] },
      { sheet: REFERENCE_SHEET, data: referenceSheet, columns: [{ width: 24 }, { width: 24 }, { width: 14 }, { width: 34 }], stickyRowsCount: 1 },
    ],
    {
      features: [
        {
          files: {
            transform: {
              // <dataValidations> wajib tepat setelah </sheetData> (tanpa mergeCells/conditionalFormatting di sheet ini)
              "xl/worksheets/sheet{id}.xml": {
                transform: (content, _options, { sheetIndex }) =>
                  sheetIndex === 0 && validations.length > 0
                    ? content.replace("</sheetData>", `</sheetData><dataValidations count="${validations.length}">${validations.join("")}</dataValidations>`)
                    : content,
              },
            },
          },
        },
      ],
    },
  ).toBuffer();
}

function columnRange(key: EmployeeImportColumnKey): string {
  const letter = columnLetter(EMPLOYEE_IMPORT_COLUMNS.findIndex((column) => column.key === key));
  return `${letter}2:${letter}${EMPLOYEE_IMPORT_MAX_ROWS + 1}`;
}

function columnLetter(index: number): string {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  return letter;
}

// Daftar dari sheet Referensi. Peringatan (bukan tolak) — nilai lain tetap diperiksa saat unggah.
function listFromSheet(key: EmployeeImportColumnKey, referenceColumn: string, count: number): string | null {
  if (count === 0) return null;
  return `<dataValidation type="list" errorStyle="warning" allowBlank="1" showErrorMessage="1" sqref="${columnRange(key)}"><formula1>${REFERENCE_SHEET}!$${referenceColumn}$2:$${referenceColumn}$${count + 1}</formula1></dataValidation>`;
}

// Nilai tetap tanpa karakter khusus XML (L/P, status kerja, PTKP)
function inlineList(key: EmployeeImportColumnKey, values: string[]): string {
  return `<dataValidation type="list" errorStyle="warning" allowBlank="1" showErrorMessage="1" sqref="${columnRange(key)}"><formula1>"${values.join(",")}"</formula1></dataValidation>`;
}

function instructions(): SheetData {
  const title = (value: string): Row => [{ value, fontWeight: "bold", fontSize: 13 }];
  const line = (label: string, value: string): Row => [{ value: label, fontWeight: "bold", alignVertical: "top" }, { value, wrap: true }];
  return [
    title("Cara mengisi template impor karyawan"),
    [],
    line("Baris", `Satu karyawan per baris di sheet "${EMPLOYEE_IMPORT_SHEET}", mulai baris 2. Jangan mengubah judul kolom. Kolom bertanda * wajib diisi.`),
    line("Departemen & Jabatan", `Harus sama dengan data di menu Organisasi (daftar di sheet "${REFERENCE_SHEET}"). Belum ada? Tambahkan dulu di Organisasi, lalu unduh template baru.`),
    line("Atasan langsung", "Nomor induk atau nama lengkap karyawan yang sudah terdaftar atau ada di file ini. Kosongkan jika tidak ada."),
    line("Status kerja", "Tetap, Kontrak, atau Percobaan. Kontrak wajib mengisi Akhir kontrak; Percobaan wajib mengisi Akhir percobaan."),
    line("Tanggal", "Format tanggal Excel, atau tulis dd/mm/yyyy (contoh 03/02/2024)."),
    line("NIK, NPWP, rekening, HP", "Sel sudah berformat Teks. NIK 16 digit, NPWP 15 atau 16 digit. Jika menyalin dari file lain, tempel sebagai nilai (Paste Values) agar tidak berubah menjadi angka."),
    line("Kode lain", `Jenis kelamin: L atau P. Status PTKP: TK/0–TK/3 atau K/0–K/3 (TK = tidak kawin, K = kawin, angka = tanggungan). Bank: kode dari sheet "${REFERENCE_SHEET}".`),
    line("Setelah diunggah", "Exapay menampilkan pratinjau dan kesalahan per baris. Hanya baris tanpa kesalahan yang disimpan, setelah Anda konfirmasi."),
    [],
    title("Contoh baris"),
    [],
    line("Nama lengkap", "Dewi Lestari"),
    line("Departemen · Jabatan", "Operasional · Barista"),
    line("Tanggal masuk", "03/02/2024"),
    line("Status kerja", "Kontrak — Akhir kontrak 12/10/2026"),
    line("Status PTKP", "TK/0"),
  ];
}
