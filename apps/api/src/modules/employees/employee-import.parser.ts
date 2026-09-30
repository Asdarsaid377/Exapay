import {
  BANKS,
  type BankCode,
  EMPLOYEE_IMPORT_COLUMNS,
  EMPLOYEE_IMPORT_MAX_ROWS,
  EMPLOYEE_IMPORT_SHEET,
  type EmployeeImportColumnKey,
  type EmploymentStatus,
  type Gender,
  type PtkpStatus,
} from "@exapay/shared";
import { unzipSync } from "fflate";
import readXlsxFile, { InvalidInputError, InvalidSpreadsheetError } from "read-excel-file/node";

// Membaca file impor karyawan (feature 12) menjadi nilai per kolom + kesalahan per sel.
// Murni: tanpa NestJS & DB — pencocokan departemen/jabatan/atasan dan duplikat dicek di EmployeeImportService.

// Sel angka ditandai agar bisa dibedakan dari teks: NIK 16 digit yang disimpan Excel sebagai angka
// sudah kehilangan digit terakhir (presisi Excel 15 digit), dan nomor HP/NPWP kehilangan angka 0 di depan.
type NumericCell = { numeric: string };
type CellValue = string | boolean | Date | NumericCell | null;

// File .xlsx adalah zip; tolak isi yang mengembang berlebihan (zip bomb) sebelum dibaca
const MAX_UNCOMPRESSED_BYTES = 30 * 1024 * 1024;

export type ImportRowValues = {
  fullName: string | null;
  employeeNumber: string | null;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: Gender | null;
  department: string | null;
  position: string | null;
  supervisor: string | null;
  joinDate: string | null;
  employmentStatus: EmploymentStatus | null;
  contractEndDate: string | null;
  probationEndDate: string | null;
  nik: string | null;
  npwp: string | null;
  ptkpStatus: PtkpStatus | null;
  bankCode: BankCode | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
};

// "row" = kesalahan tingkat baris (mis. duplikat)
export type IssueKey = EmployeeImportColumnKey | "row";

export type ParsedImportRow = {
  rowNumber: number;
  values: ImportRowValues;
  // Satu pesan per kolom — pesan pertama menang
  issues: Map<IssueKey, string>;
};

export type ImportSheetResult = { ok: true; rows: ParsedImportRow[] } | { ok: false; message: string };

const TEMPLATE_HINT = "Unduh template dari halaman impor lalu salin data ke sana.";
const XLS_MESSAGE = "File .xls (Excel lama) tidak didukung. Simpan ulang sebagai .xlsx lalu unggah lagi.";
// Tanda awal file Office lama (.xls, format OLE) — bukan zip
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

export async function parseImportFile(buffer: Buffer): Promise<ImportSheetResult> {
  if (buffer.subarray(0, 4).equals(OLE_SIGNATURE)) return { ok: false, message: XLS_MESSAGE };
  const sizeError = uncompressedSizeError(buffer);
  if (sizeError) return { ok: false, message: sizeError };

  let sheets: { sheet: string; data: unknown[][] }[];
  try {
    sheets = await readXlsxFile<NumericCell>(buffer, { parseNumber: (value) => ({ numeric: value }) });
  } catch (error: unknown) {
    if (error instanceof InvalidInputError) {
      if (error.code === "XLS_FILE_NOT_SUPPORTED") return { ok: false, message: XLS_MESSAGE };
      if (error.code === "NO_DATA") return { ok: false, message: "File kosong." };
      return { ok: false, message: "File bukan Excel .xlsx yang valid." };
    }
    if (error instanceof InvalidSpreadsheetError) return { ok: false, message: "File Excel rusak atau tidak bisa dibaca. Simpan ulang file lalu coba lagi." };
    throw error;
  }

  const sheet = sheets.find((item) => item.sheet.trim().toLowerCase() === EMPLOYEE_IMPORT_SHEET.toLowerCase()) ?? sheets[0];
  const [headerRow, ...dataRows] = sheet?.data ?? [];
  if (!headerRow) return { ok: false, message: `Sheet "${EMPLOYEE_IMPORT_SHEET}" kosong. ${TEMPLATE_HINT}` };

  // Posisi kolom dari header — urutan kolom bebas, kolom tambahan diabaikan
  const positions = new Map<EmployeeImportColumnKey, number>();
  headerRow.forEach((cell, index) => {
    const header = normalizeHeader(cell);
    const column = EMPLOYEE_IMPORT_COLUMNS.find((item) => normalizeHeader(item.header) === header);
    if (column && !positions.has(column.key)) positions.set(column.key, index);
  });
  const missing = EMPLOYEE_IMPORT_COLUMNS.filter((column) => column.required && !positions.has(column.key)).map((column) => column.header);
  if (missing.length > 0) return { ok: false, message: `Kolom wajib tidak ditemukan: ${missing.join(", ")}. ${TEMPLATE_HINT}` };

  const rows: ParsedImportRow[] = [];
  for (const [index, cells] of dataRows.entries()) {
    const read = (key: EmployeeImportColumnKey): CellValue => {
      const position = positions.get(key);
      return position === undefined ? null : toCell(cells[position]);
    };
    if (EMPLOYEE_IMPORT_COLUMNS.every((column) => isBlank(read(column.key)))) continue;
    if (rows.length === EMPLOYEE_IMPORT_MAX_ROWS) {
      return { ok: false, message: `File berisi lebih dari ${EMPLOYEE_IMPORT_MAX_ROWS} baris karyawan. Bagi menjadi beberapa file.` };
    }
    // +2: baris Excel dimulai dari 1 dan baris 1 adalah header
    rows.push(parseRow(index + 2, read));
  }
  if (rows.length === 0) return { ok: false, message: "Tidak ada baris karyawan di file. Isi data mulai baris 2, di bawah judul kolom." };
  return { ok: true, rows };
}

function parseRow(rowNumber: number, read: (key: EmployeeImportColumnKey) => CellValue): ParsedImportRow {
  const issues = new Map<IssueKey, string>();
  const take = <T>(key: EmployeeImportColumnKey, result: Parsed<T>): T | null => {
    if ("issue" in result) {
      if (!issues.has(key)) issues.set(key, result.issue);
      return null;
    }
    return result.value;
  };
  const text = (key: EmployeeImportColumnKey) => take(key, textOf(read(key)));
  const required = <T>(key: EmployeeImportColumnKey, value: T | null): T | null => {
    if (value === null && !issues.has(key)) issues.set(key, "Wajib diisi");
    return value;
  };

  const values: ImportRowValues = {
    fullName: required("fullName", text("fullName")),
    employeeNumber: text("employeeNumber"),
    email: text("email"),
    phone: take("phone", identityOf(read("phone"), "Nomor HP")),
    birthDate: take("birthDate", dateOf(read("birthDate"))),
    gender: take("gender", mapped(read("gender"), genderOf, "Isi L (laki-laki) atau P (perempuan)")),
    department: required("department", text("department")),
    position: required("position", text("position")),
    supervisor: text("supervisor"),
    joinDate: required("joinDate", take("joinDate", dateOf(read("joinDate")))),
    employmentStatus: required("employmentStatus", take("employmentStatus", mapped(read("employmentStatus"), employmentStatusOf, "Isi Tetap, Kontrak, atau Percobaan"))),
    contractEndDate: take("contractEndDate", dateOf(read("contractEndDate"))),
    probationEndDate: take("probationEndDate", dateOf(read("probationEndDate"))),
    nik: take("nik", identityOf(read("nik"), "NIK")),
    npwp: take("npwp", identityOf(read("npwp"), "NPWP")),
    ptkpStatus: required("ptkpStatus", take("ptkpStatus", mapped(read("ptkpStatus"), ptkpOf, "Isi salah satu: TK/0–TK/3 atau K/0–K/3"))),
    bankCode: take("bank", mapped(read("bank"), bankOf, "Bank tidak dikenali. Pilih dari daftar di sheet Referensi.")),
    bankAccountNumber: take("bankAccountNumber", identityOf(read("bankAccountNumber"), "Nomor rekening")),
    bankAccountHolder: text("bankAccountHolder"),
  };
  return { rowNumber, values, issues };
}

// ——— Konversi sel ———

type Parsed<T> = { value: T | null } | { issue: string };

function toCell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean" || value instanceof Date) return value;
  if (typeof value === "object" && typeof Reflect.get(value, "numeric") === "string") return { numeric: String(Reflect.get(value, "numeric")) };
  return String(value);
}

function isBlank(cell: CellValue): boolean {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

function isNumeric(cell: CellValue): cell is NumericCell {
  return typeof cell === "object" && cell !== null && !(cell instanceof Date);
}

function textOf(cell: CellValue): Parsed<string> {
  if (isBlank(cell)) return { value: null };
  if (cell instanceof Date) return { issue: "Berisi tanggal, bukan teks" };
  if (isNumeric(cell)) return { value: cell.numeric };
  return { value: String(cell).trim().replace(/\s+/g, " ") };
}

// NIK, NPWP, rekening, HP: wajib sel Teks. Sel angka sudah kehilangan digit (lihat NumericCell).
function identityOf(cell: CellValue, label: string): Parsed<string> {
  if (isNumeric(cell)) return { issue: `${label} tersimpan sebagai angka sehingga digit bisa hilang. Ubah format sel menjadi Teks lalu ketik ulang.` };
  return textOf(cell);
}

function mapped<T>(cell: CellValue, map: (normalized: string) => T | null, message: string): Parsed<T> {
  const text = textOf(cell);
  if ("issue" in text || text.value === null) return text as Parsed<T>;
  const value = map(text.value.toLowerCase().replace(/[\s_-]+/g, ""));
  return value === null ? { issue: message } : { value };
}

const DATE_MESSAGE = "Tanggal tidak dikenali. Gunakan format tanggal Excel atau tulis dd/mm/yyyy.";

function dateOf(cell: CellValue): Parsed<string> {
  if (isBlank(cell)) return { value: null };
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return { issue: DATE_MESSAGE };
    return isoDate(cell.getUTCFullYear(), cell.getUTCMonth() + 1, cell.getUTCDate());
  }
  if (typeof cell !== "string") return { issue: DATE_MESSAGE };
  const value = cell.trim();
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(value);
  if (dmy) return isoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (ymd) return isoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  return { issue: DATE_MESSAGE };
}

function isoDate(year: number, month: number, day: number): Parsed<string> {
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!real || year < 1900 || year > 2100) return { issue: DATE_MESSAGE };
  return { value: date.toISOString().slice(0, 10) };
}

function genderOf(value: string): Gender | null {
  if (["l", "lakilaki", "laki", "pria"].includes(value)) return "male";
  if (["p", "perempuan", "wanita"].includes(value)) return "female";
  return null;
}

// PKWTT = karyawan tetap, PKWT = kontrak (istilah UU Ketenagakerjaan)
function employmentStatusOf(value: string): EmploymentStatus | null {
  if (value === "tetap" || value === "pkwtt") return "permanent";
  if (value === "kontrak" || value === "pkwt") return "contract";
  if (value === "percobaan") return "probation";
  return null;
}

function ptkpOf(value: string): PtkpStatus | null {
  const match = /^(tk|k)\/?([0-3])$/.exec(value);
  return match ? (`${match[1]?.toUpperCase()}/${match[2]}` as PtkpStatus) : null;
}

function bankOf(value: string): BankCode | null {
  const plain = (text: string) => text.toLowerCase().replace(/[\s_-]+/g, "");
  return BANKS.find((bank) => plain(bank.code) === value || plain(bank.name) === value)?.code ?? null;
}

function normalizeHeader(value: unknown): string {
  return typeof value === "string" ? value.replace(/\*/g, "").trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function uncompressedSizeError(buffer: Buffer): string | null {
  let total = 0;
  try {
    // filter selalu false: hanya membaca direktori zip, tidak mengekstrak apa pun
    unzipSync(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength), {
      filter: (file) => {
        total += file.originalSize;
        return false;
      },
    });
  } catch {
    return "File bukan Excel .xlsx yang valid.";
  }
  return total > MAX_UNCOMPRESSED_BYTES ? "Isi file terlalu besar untuk diimpor." : null;
}
