import { randomUUID } from "node:crypto";

import { departments, employees, positions } from "@exapay/db";
import {
  EMPLOYEE_IMPORT_COLUMNS,
  type EmployeeFormInput,
  type EmployeeImportPreview,
  type EmployeeImportResult,
  type EmployeeImportRow,
  type EmployeeInput,
  employeeInputSchema,
} from "@exapay/shared";
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { asc, inArray } from "drizzle-orm";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import { DRIZZLE } from "../../database/database.module.js";
import { foreignKeyViolationConstraint, uniqueViolationConstraint } from "../../database/errors.js";
import { type Database, type TenantContext, type Transaction, withTenant } from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";
import { type IssueKey, type ParsedImportRow, parseImportFile } from "./employee-import.parser.js";
import { buildImportTemplate } from "./employee-import.template.js";
import { EmployeesService } from "./employees.service.js";

// Pengganti id yang belum ketemu — hanya agar schema bisa memeriksa kolom lain; barisnya sudah pasti bermasalah
const PLACEHOLDER_ID = "00000000-0000-4000-8000-000000000000";

type Ref = { id: string; name: string };
type ExistingEmployee = { id: string; fullName: string; employeeNumber: string | null; endDate: string | null };

// Atasan langsung: karyawan terdaftar, atau baris lain di file yang sama (indeks baris)
type SupervisorRef = { kind: "existing"; id: string } | { kind: "file"; index: number };

type PlannedRow = {
  row: ParsedImportRow;
  // Id dibuat di aplikasi agar baris lain di file bisa menunjuknya sebagai atasan
  id: string;
  department: Ref | null;
  position: Ref | null;
  supervisor: SupervisorRef | null;
  input: EmployeeInput | null;
};

const HEADERS = new Map<IssueKey, string>([["row", "Baris"], ...EMPLOYEE_IMPORT_COLUMNS.map((column) => [column.key, column.header] as const)]);

// Path schema employeeInputSchema → kolom template
const SCHEMA_COLUMNS: Record<string, IssueKey> = {
  departmentId: "department",
  positionId: "position",
  supervisorId: "supervisor",
  bankCode: "bank",
};

const key = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

// Impor karyawan dari Excel (feature 12). Pratinjau & simpan memakai perencanaan yang sama; simpan membaca
// ulang file (tanpa state di server) dan hanya menyimpan baris tanpa kesalahan, semua dalam satu transaksi.
@Injectable()
export class EmployeeImportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly employeesService: EmployeesService,
  ) {}

  async template(user: AuthUser): Promise<Buffer> {
    const ctx = tenantContextOf(user);
    const references = await withTenant(this.db, ctx, async (tx) => {
      await this.employeesService.manager(tx, ctx);
      const departmentRows = await tx.select({ name: departments.name }).from(departments).orderBy(asc(departments.name));
      const positionRows = await tx.select({ name: positions.name }).from(positions).orderBy(asc(positions.name));
      return { departments: departmentRows.map((row) => row.name), positions: positionRows.map((row) => row.name) };
    });
    return buildImportTemplate(references);
  }

  async preview(user: AuthUser, file: Buffer): Promise<EmployeeImportPreview> {
    const rows = await this.readFile(file);
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.employeesService.manager(tx, ctx);
      const planned = await this.plan(tx, ctx, rows);
      const previewRows = planned.map(toPreviewRow);
      const validCount = previewRows.filter((row) => row.issues.length === 0).length;
      return { rows: previewRows, validCount, invalidCount: previewRows.length - validCount };
    });
  }

  async commit(user: AuthUser, file: Buffer): Promise<EmployeeImportResult> {
    const rows = await this.readFile(file);
    const ctx = tenantContextOf(user);
    try {
      return await withTenant(this.db, ctx, async (tx) => {
        await this.employeesService.manager(tx, ctx);
        const planned = await this.plan(tx, ctx, rows);
        const valid = insertionOrder(planned);
        if (valid.length === 0) throw new BadRequestException("Tidak ada baris yang bisa diimpor. Perbaiki kesalahan di file lalu unggah ulang.");

        await tx.insert(employees).values(
          valid.map(({ id, input }) => ({
            id,
            tenantId: ctx.tenantId,
            ...this.employeesService.plainColumns(input),
            ...this.employeesService.sensitiveColumns(ctx, input),
          })),
        );
        for (const { id, input } of valid) {
          await this.audit.record(tx, ctx, {
            entity: "employee",
            entityId: id,
            action: "create",
            after: { ...this.employeesService.auditView(input), source: "import" },
          });
        }
        return { imported: valid.length, skipped: planned.length - valid.length };
      });
    } catch (error: unknown) {
      // Data berubah di antara pemeriksaan dan penyimpanan (mis. karyawan lain baru ditambahkan)
      if (uniqueViolationConstraint(error) !== null || foreignKeyViolationConstraint(error) !== null) {
        throw new ConflictException("Data karyawan berubah saat impor. Unggah ulang file untuk memeriksa lagi.");
      }
      throw error;
    }
  }

  private async readFile(file: Buffer): Promise<ParsedImportRow[]> {
    const result = await parseImportFile(file);
    if (!result.ok) throw new BadRequestException(result.message);
    return result.rows;
  }

  private async plan(tx: Transaction, ctx: TenantContext, rows: ParsedImportRow[]): Promise<PlannedRow[]> {
    const departmentRows = await tx.select({ id: departments.id, name: departments.name }).from(departments);
    const positionRows = await tx.select({ id: positions.id, name: positions.name }).from(positions);
    const existing: ExistingEmployee[] = await tx
      .select({ id: employees.id, fullName: employees.fullName, employeeNumber: employees.employeeNumber, endDate: employees.endDate })
      .from(employees);
    const departmentsByName = new Map(departmentRows.map((row) => [key(row.name), row]));
    const positionsByName = new Map(positionRows.map((row) => [key(row.name), row]));

    const planned: PlannedRow[] = rows.map((row) => {
      const { values } = row;
      const department = values.department ? (departmentsByName.get(key(values.department)) ?? null) : null;
      const position = values.position ? (positionsByName.get(key(values.position)) ?? null) : null;
      if (values.department && !department) addIssue(row, "department", `Departemen "${values.department}" tidak ditemukan. Periksa ejaan atau tambahkan di menu Organisasi.`);
      if (values.position && !position) addIssue(row, "position", `Jabatan "${values.position}" tidak ditemukan. Periksa ejaan atau tambahkan di menu Organisasi.`);
      return { row, id: randomUUID(), department, position, supervisor: null, input: null };
    });

    this.resolveSupervisors(planned, existing);
    for (const item of planned) item.input = validateRow(item);
    await this.checkDuplicates(tx, ctx, planned, existing);
    rejectBrokenChains(planned);
    for (const item of planned) if (item.row.issues.size > 0) item.input = null;
    return planned;
  }

  // Cocokkan dulu nomor induk, lalu nama lengkap — di karyawan terdaftar dan di baris file
  private resolveSupervisors(planned: PlannedRow[], existing: ExistingEmployee[]): void {
    const existingByNumber = groupBy(existing, (employee) => employee.employeeNumber);
    const existingByName = groupBy(existing, (employee) => employee.fullName);
    const fileByNumber = groupBy(planned.map((item, index) => ({ item, index })), ({ item }) => item.row.values.employeeNumber);
    const fileByName = groupBy(planned.map((item, index) => ({ item, index })), ({ item }) => item.row.values.fullName);

    planned.forEach((item, index) => {
      const reference = item.row.values.supervisor;
      if (!reference || item.row.issues.has("supervisor")) return;
      const lookup = key(reference);
      let matches: SupervisorRef[] = [
        ...(existingByNumber.get(lookup) ?? []).map((employee): SupervisorRef => ({ kind: "existing", id: employee.id })),
        ...(fileByNumber.get(lookup) ?? []).map((match): SupervisorRef => ({ kind: "file", index: match.index })),
      ];
      if (matches.length === 0) {
        matches = [
          ...(existingByName.get(lookup) ?? []).map((employee): SupervisorRef => ({ kind: "existing", id: employee.id })),
          ...(fileByName.get(lookup) ?? []).map((match): SupervisorRef => ({ kind: "file", index: match.index })),
        ];
      }

      const [match] = matches;
      if (!match) return addIssue(item.row, "supervisor", `Atasan "${reference}" tidak ditemukan di data karyawan maupun di file ini.`);
      if (matches.length > 1) return addIssue(item.row, "supervisor", `Ada lebih dari satu karyawan "${reference}". Tulis nomor induk atasan.`);
      if (match.kind === "file" && match.index === index) return addIssue(item.row, "supervisor", "Karyawan tidak boleh menjadi atasan dirinya sendiri.");
      if (match.kind === "existing" && existing.find((employee) => employee.id === match.id)?.endDate) {
        return addIssue(item.row, "supervisor", `Atasan "${reference}" sudah nonaktif.`);
      }
      item.supervisor = match;
    });
  }

  // Nomor induk & NIK unik per usaha: bentrok sesama baris file atau dengan karyawan terdaftar
  private async checkDuplicates(tx: Transaction, ctx: TenantContext, planned: PlannedRow[], existing: ExistingEmployee[]): Promise<void> {
    const existingByNumber = groupBy(existing, (employee) => employee.employeeNumber);
    markFileDuplicates(planned, "employeeNumber", (item) => item.row.values.employeeNumber, "Nomor induk sama dengan baris");
    for (const item of planned) {
      const number = item.row.values.employeeNumber;
      const owner = number ? existingByNumber.get(key(number))?.[0] : undefined;
      if (owner) addIssue(item.row, "employeeNumber", `Nomor induk sudah dipakai ${owner.fullName}.`);
    }

    // NIK dibandingkan setelah dibersihkan schema (tanpa spasi/titik); baris dengan NIK tidak valid dilewati
    const nikOf = (item: PlannedRow) => item.input?.nik ?? cleanNik(item.row.values.nik);
    markFileDuplicates(planned, "nik", nikOf, "NIK sama dengan baris");
    const hashes = new Map<string, PlannedRow[]>();
    for (const item of planned) {
      const nik = nikOf(item);
      if (!nik) continue;
      const hash = this.employeesService.nikHash(ctx, nik);
      hashes.set(hash, [...(hashes.get(hash) ?? []), item]);
    }
    if (hashes.size === 0) return;
    const owners = await tx.select({ nikHash: employees.nikHash, fullName: employees.fullName }).from(employees).where(inArray(employees.nikHash, [...hashes.keys()]));
    for (const owner of owners) {
      for (const item of hashes.get(owner.nikHash ?? "") ?? []) addIssue(item.row, "nik", `NIK sudah terdaftar untuk ${owner.fullName}.`);
    }
  }
}

function addIssue(row: ParsedImportRow, column: IssueKey, message: string): void {
  if (!row.issues.has(column)) row.issues.set(column, message);
}

function groupBy<T>(items: T[], pick: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = pick(item);
    if (!value) continue;
    const group = key(value);
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return groups;
}

function cleanNik(value: string | null): string | null {
  const digits = value?.replace(/[\s.-]/g, "") ?? "";
  return /^[0-9]{16}$/.test(digits) ? digits : null;
}

function markFileDuplicates(planned: PlannedRow[], column: IssueKey, pick: (item: PlannedRow) => string | null, message: string): void {
  for (const group of groupBy(planned, pick).values()) {
    if (group.length < 2) continue;
    for (const item of group) {
      const others = group.filter((other) => other !== item).map((other) => other.row.rowNumber);
      addIssue(item.row, column, `${message} ${others.join(", ")}.`);
    }
  }
}

// Aturan isian yang sama dengan form tambah karyawan (employeeInputSchema)
function validateRow(item: PlannedRow): EmployeeInput | null {
  const { values } = item.row;
  const candidate: EmployeeFormInput = {
    fullName: values.fullName ?? "",
    employeeNumber: values.employeeNumber,
    email: values.email,
    phone: values.phone,
    birthDate: values.birthDate,
    gender: values.gender,
    departmentId: item.department?.id ?? PLACEHOLDER_ID,
    positionId: item.position?.id ?? PLACEHOLDER_ID,
    // Atasan dari file: id baris itu (dibuat di aplikasi, disimpan dalam transaksi yang sama)
    supervisorId: item.supervisor?.kind === "existing" ? item.supervisor.id : item.supervisor ? PLACEHOLDER_ID : null,
    joinDate: values.joinDate ?? "",
    employmentStatus: values.employmentStatus ?? "permanent",
    contractEndDate: values.contractEndDate,
    probationEndDate: values.probationEndDate,
    nik: values.nik,
    npwp: values.npwp,
    ptkpStatus: values.ptkpStatus ?? "TK/0",
    bankCode: values.bankCode,
    bankAccountNumber: values.bankAccountNumber,
    bankAccountHolder: values.bankAccountHolder,
    userId: null,
  };
  const result = employeeInputSchema.safeParse(candidate);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = String(issue.path[0] ?? "");
      const column = SCHEMA_COLUMNS[path] ?? (HEADERS.has(path as IssueKey) ? (path as IssueKey) : "row");
      addIssue(item.row, column, issue.message);
    }
    return null;
  }
  return item.row.issues.size === 0 ? result.data : null;
}

// Baris valid yang atasannya baris bermasalah ikut ditolak; rantai atasan melingkar di dalam file ditolak.
// Diulang sampai stabil karena penolakan satu baris bisa merambat ke bawahannya.
function rejectBrokenChains(planned: PlannedRow[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of planned) {
      if (item.row.issues.size > 0 || item.supervisor?.kind !== "file") continue;
      const boss = planned[item.supervisor.index];
      if (boss && boss.row.issues.size > 0) {
        addIssue(item.row, "supervisor", `Atasan di baris ${boss.row.rowNumber} masih bermasalah. Perbaiki baris itu juga.`);
        changed = true;
      }
    }
    for (const item of planned) {
      if (item.row.issues.size > 0) continue;
      const chain = [item];
      let next = item.supervisor?.kind === "file" ? planned[item.supervisor.index] : undefined;
      while (next && !chain.includes(next) && next.supervisor?.kind === "file") {
        chain.push(next);
        next = planned[next.supervisor.index];
      }
      if (next !== item) continue;
      const loop = [...chain, item].map((member) => member.row.rowNumber).join(" → ");
      for (const member of chain) addIssue(member.row, "supervisor", `Atasan langsung saling menunjuk (baris ${loop}).`);
      changed = true;
    }
  }
}

// Atasan dari file disimpan sebelum bawahannya (FK supervisor)
function insertionOrder(planned: PlannedRow[]): { id: string; input: EmployeeInput }[] {
  const valid = planned.filter((item) => item.input !== null);
  const done = new Set<PlannedRow>();
  const ordered: { id: string; input: EmployeeInput }[] = [];
  while (ordered.length < valid.length) {
    const before = ordered.length;
    for (const item of valid) {
      if (done.has(item) || !item.input) continue;
      const boss = item.supervisor?.kind === "file" ? planned[item.supervisor.index] : undefined;
      if (boss && !done.has(boss)) continue;
      ordered.push({ id: item.id, input: { ...item.input, supervisorId: boss ? boss.id : item.input.supervisorId } });
      done.add(item);
    }
    if (ordered.length === before) throw new Error("[employees/import] urutan atasan tidak bisa disusun");
  }
  return ordered;
}

function toPreviewRow(item: PlannedRow): EmployeeImportRow {
  const { values, issues } = item.row;
  const ordered = [...HEADERS.keys()].filter((column) => issues.has(column));
  return {
    rowNumber: item.row.rowNumber,
    fullName: values.fullName,
    employeeNumber: values.employeeNumber,
    departmentName: item.department?.name ?? values.department,
    positionName: item.position?.name ?? values.position,
    employmentStatus: values.employmentStatus,
    joinDate: values.joinDate,
    issues: ordered.map((column) => ({ column: HEADERS.get(column) ?? "Baris", message: issues.get(column) ?? "" })),
  };
}
