import {
  departments,
  employees,
  memberships,
  positions,
  users,
} from "@exapay/db";
import {
  type DeactivateEmployeeInput,
  type EmployeeDetail,
  type EmployeeFormOptions,
  type EmployeeInput,
  type EmployeeList,
  type EmployeeListItem,
  type EmployeeListQuery,
  EMPLOYEES_PAGE_SIZE,
  maskBankAccount,
  maskNik,
  maskNpwp,
  type MembershipRole,
  type RevealedSensitive,
  type SensitiveSection,
} from "@exapay/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  eq,
  ilike,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { type AuthUser, tenantContextOf } from "../../common/auth/auth-user.js";
import {
  type CipherContext,
  FieldCipher,
} from "../../common/crypto/field-cipher.js";
import { DRIZZLE } from "../../database/database.module.js";
import {
  foreignKeyViolationConstraint,
  uniqueViolationConstraint,
} from "../../database/errors.js";
import {
  type Database,
  type TenantContext,
  type Transaction,
  withTenant,
} from "../../database/tenant-transaction.js";
import { AuditService } from "../audit/audit.service.js";

const NO_ACCESS = "Anda tidak memiliki akses ke data karyawan";
const NOT_FOUND = "Karyawan tidak ditemukan";

// Penglihat: owner/admin melihat semua; atasan hanya bawahan langsung (supervisor_id = data karyawan miliknya)
type Viewer = {
  role: MembershipRole;
  manage: boolean;
  ownEmployeeId: string | null;
};

// Nama kolom konteks enkripsi — juga dipakai ekspor transfer bank (feature 32)
export const FIELD = {
  nik: "employees.nik",
  npwp: "employees.npwp",
  bankAccount: "employees.bank_account",
} as const;

const supervisor = alias(employees, "supervisor");

// Kolom daftar + detail non-sensitif (tanpa ciphertext)
const LIST_COLUMNS = {
  id: employees.id,
  fullName: employees.fullName,
  employeeNumber: employees.employeeNumber,
  departmentId: departments.id,
  departmentName: departments.name,
  positionId: positions.id,
  positionName: positions.name,
  supervisorId: supervisor.id,
  supervisorName: supervisor.fullName,
  employmentStatus: employees.employmentStatus,
  joinDate: employees.joinDate,
  contractEndDate: employees.contractEndDate,
  probationEndDate: employees.probationEndDate,
  endDate: employees.endDate,
};

type ListRow = {
  id: string;
  fullName: string;
  employeeNumber: string | null;
  departmentId: string;
  departmentName: string;
  positionId: string;
  positionName: string;
  supervisorId: string | null;
  supervisorName: string | null;
  employmentStatus: EmployeeListItem["employmentStatus"];
  joinDate: string;
  contractEndDate: string | null;
  probationEndDate: string | null;
  endDate: string | null;
};

function toListItem(row: ListRow): EmployeeListItem {
  return {
    id: row.id,
    fullName: row.fullName,
    employeeNumber: row.employeeNumber,
    department: { id: row.departmentId, name: row.departmentName },
    position: { id: row.positionId, name: row.positionName },
    supervisor:
      row.supervisorId && row.supervisorName
        ? { id: row.supervisorId, fullName: row.supervisorName }
        : null,
    employmentStatus: row.employmentStatus,
    joinDate: row.joinDate,
    contractEndDate: row.contractEndDate,
    probationEndDate: row.probationEndDate,
    endDate: row.endDate,
  };
}

// Pola LIKE aman: % dan _ dari input diperlakukan sebagai huruf biasa
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Constraint → pesan untuk user (unique & FK). Nama sesuai migration 0009.
const UNIQUE_MESSAGES: Record<string, string> = {
  employees_tenant_number_key:
    "Nomor induk karyawan sudah dipakai karyawan lain",
  employees_tenant_nik_hash_key: "NIK ini sudah terdaftar untuk karyawan lain",
  employees_tenant_user_key: "Akun ini sudah tertaut ke karyawan lain",
};
const FOREIGN_KEY_MESSAGES: Record<string, string> = {
  employees_department_fk: "Departemen tidak ditemukan",
  employees_position_fk: "Jabatan tidak ditemukan",
  employees_supervisor_fk: "Atasan langsung tidak ditemukan",
  employees_membership_fk: "Akun yang dipilih bukan anggota usaha ini",
};

// Data karyawan (feature 11). RLS tenant_isolation membatasi baris ke tenant aktif; aturan atasan-bawahan dicek di sini.
// Peran dibaca ulang dari memberships di setiap transaksi (klaim JWT bisa basi ≤ 15 menit).
// Nilai sensitif hanya didekripsi untuk owner/admin: tersamar di detail, penuh hanya lewat reveal() (tercatat di audit log).
@Injectable()
export class EmployeesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly cipher: FieldCipher,
  ) {}

  async list(user: AuthUser, query: EmployeeListQuery): Promise<EmployeeList> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.viewer(tx, ctx);
      const scope = this.scopeCondition(viewer);

      const filters: (SQL | undefined)[] = [scope];
      if (query.activity === "active") filters.push(isNull(employees.endDate));
      if (query.activity === "inactive")
        filters.push(isNotNull(employees.endDate));
      if (query.departmentId)
        filters.push(eq(employees.departmentId, query.departmentId));
      if (query.status)
        filters.push(eq(employees.employmentStatus, query.status));
      if (query.q)
        filters.push(
          or(
            ilike(employees.fullName, likePattern(query.q)),
            ilike(employees.employeeNumber, likePattern(query.q)),
          ),
        );
      const where = and(...filters);

      const [totalRow] = await tx
        .select({ total: count() })
        .from(employees)
        .where(where);
      const rows = await tx
        .select(LIST_COLUMNS)
        .from(employees)
        .innerJoin(departments, eq(departments.id, employees.departmentId))
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .leftJoin(supervisor, eq(supervisor.id, employees.supervisorId))
        .where(where)
        .orderBy(asc(employees.fullName), asc(employees.id))
        .limit(EMPLOYEES_PAGE_SIZE)
        .offset((query.page - 1) * EMPLOYEES_PAGE_SIZE);

      const [counts] = await tx
        .select({
          active: sql<number>`count(*) filter (where ${employees.endDate} is null)::int`,
          inactive: sql<number>`count(*) filter (where ${employees.endDate} is not null)::int`,
        })
        .from(employees)
        .where(scope);

      return {
        items: rows.map(toListItem),
        total: totalRow?.total ?? 0,
        page: query.page,
        pageSize: EMPLOYEES_PAGE_SIZE,
        counts: {
          active: counts?.active ?? 0,
          inactive: counts?.inactive ?? 0,
        },
        scope: viewer.manage ? "all" : "subordinates",
      };
    });
  }

  async detail(user: AuthUser, id: string): Promise<EmployeeDetail> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      const viewer = await this.viewer(tx, ctx);
      const [row] = await tx
        .select({
          ...LIST_COLUMNS,
          email: employees.email,
          phone: employees.phone,
          birthDate: employees.birthDate,
          gender: employees.gender,
          endReason: employees.endReason,
          userId: employees.userId,
          userEmail: users.email,
          ptkpStatus: employees.ptkpStatus,
          nikEncrypted: employees.nikEncrypted,
          npwpEncrypted: employees.npwpEncrypted,
          bankCode: employees.bankCode,
          bankAccountEncrypted: employees.bankAccountEncrypted,
          bankAccountHolder: employees.bankAccountHolder,
          updatedAt: employees.updatedAt,
        })
        .from(employees)
        .innerJoin(departments, eq(departments.id, employees.departmentId))
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .leftJoin(supervisor, eq(supervisor.id, employees.supervisorId))
        .leftJoin(users, eq(users.id, employees.userId))
        .where(and(eq(employees.id, id), this.scopeCondition(viewer)));
      // Di luar cakupan (mis. bukan bawahan) = tidak ditemukan — tidak membocorkan keberadaan karyawan
      if (!row) throw new NotFoundException(NOT_FOUND);

      const context = (field: string): CipherContext => ({
        tenantId: ctx.tenantId,
        field,
      });
      return {
        ...toListItem(row),
        email: row.email,
        phone: row.phone,
        birthDate: row.birthDate,
        gender: row.gender,
        endReason: row.endReason,
        userAccount:
          row.userId && row.userEmail
            ? { id: row.userId, email: row.userEmail }
            : null,
        // Atasan: data pajak & rekening tidak dikirim sama sekali (tidak didekripsi)
        confidential: viewer.manage
          ? {
              ptkpStatus: row.ptkpStatus,
              nikMasked: row.nikEncrypted
                ? maskNik(
                    this.cipher.decrypt(row.nikEncrypted, context(FIELD.nik)),
                  )
                : null,
              npwpMasked: row.npwpEncrypted
                ? maskNpwp(
                    this.cipher.decrypt(row.npwpEncrypted, context(FIELD.npwp)),
                  )
                : null,
              bankCode: row.bankCode as NonNullable<
                EmployeeDetail["confidential"]
              >["bankCode"],
              bankAccountMasked: row.bankAccountEncrypted
                ? maskBankAccount(
                    this.cipher.decrypt(
                      row.bankAccountEncrypted,
                      context(FIELD.bankAccount),
                    ),
                  )
                : null,
              bankAccountHolder: row.bankAccountHolder,
            }
          : null,
        canManage: viewer.manage,
        updatedAt: row.updatedAt.toISOString(),
      };
    });
  }

  // Pilihan form tambah/ubah. excludeId: karyawan yang sedang diubah (tidak bisa jadi atasan dirinya sendiri)
  async formOptions(
    user: AuthUser,
    excludeId: string | null,
  ): Promise<EmployeeFormOptions> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.manager(tx, ctx);
      // Berurutan: satu koneksi transaksi tidak boleh menjalankan query paralel
      const departmentRows = await tx
        .select({ id: departments.id, name: departments.name })
        .from(departments)
        .orderBy(asc(departments.name));
      const positionRows = await tx
        .select({ id: positions.id, name: positions.name })
        .from(positions)
        .orderBy(asc(positions.name));
      const supervisorRows = await tx
        .select({
          id: employees.id,
          fullName: employees.fullName,
          positionName: positions.name,
        })
        .from(employees)
        .innerJoin(positions, eq(positions.id, employees.positionId))
        .where(
          and(
            isNull(employees.endDate),
            excludeId ? ne(employees.id, excludeId) : undefined,
          ),
        )
        .orderBy(asc(employees.fullName));
      // Anggota usaha yang belum tertaut ke karyawan mana pun. Filter tenant wajib (policy own_memberships_select).
      const userRows = await tx
        .select({ id: users.id, fullName: users.fullName, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(
          employees,
          and(
            eq(employees.tenantId, memberships.tenantId),
            eq(employees.userId, memberships.userId),
          ),
        )
        .where(
          and(eq(memberships.tenantId, ctx.tenantId), isNull(employees.id)),
        )
        .orderBy(asc(users.fullName));
      return {
        departments: departmentRows,
        positions: positionRows,
        supervisors: supervisorRows,
        users: userRows,
      };
    });
  }

  async create(user: AuthUser, input: EmployeeInput): Promise<{ id: string }> {
    const ctx = tenantContextOf(user);
    return this.mapConstraintErrors(() =>
      withTenant(this.db, ctx, async (tx) => {
        await this.manager(tx, ctx);
        if (input.supervisorId)
          await this.assertActiveSupervisor(tx, input.supervisorId);

        const [row] = await tx
          .insert(employees)
          .values({
            tenantId: ctx.tenantId,
            ...this.plainColumns(input),
            ...this.sensitiveColumns(ctx, input),
          })
          .returning({ id: employees.id });
        if (!row)
          throw new Error(
            "[employees/create] insert tidak mengembalikan baris",
          );

        await this.audit.record(tx, ctx, {
          entity: "employee",
          entityId: row.id,
          action: "create",
          after: this.auditView(input),
        });
        return { id: row.id };
      }),
    );
  }

  async update(
    user: AuthUser,
    id: string,
    input: EmployeeInput,
  ): Promise<void> {
    const ctx = tenantContextOf(user);
    await this.mapConstraintErrors(() =>
      withTenant(this.db, ctx, async (tx) => {
        await this.manager(tx, ctx);
        // Baris dikunci: dua pengelola yang mengubah karyawan yang sama tidak saling menimpa diam-diam
        const [current] = await tx
          .select({
            fullName: employees.fullName,
            employeeNumber: employees.employeeNumber,
            email: employees.email,
            phone: employees.phone,
            birthDate: employees.birthDate,
            gender: employees.gender,
            departmentId: employees.departmentId,
            positionId: employees.positionId,
            supervisorId: employees.supervisorId,
            userId: employees.userId,
            joinDate: employees.joinDate,
            employmentStatus: employees.employmentStatus,
            contractEndDate: employees.contractEndDate,
            probationEndDate: employees.probationEndDate,
            ptkpStatus: employees.ptkpStatus,
            bankCode: employees.bankCode,
            bankAccountHolder: employees.bankAccountHolder,
            endDate: employees.endDate,
          })
          .from(employees)
          .where(eq(employees.id, id))
          .for("update");
        if (!current) throw new NotFoundException(NOT_FOUND);
        if (current.endDate)
          throw new ConflictException(
            "Karyawan nonaktif tidak bisa diubah. Aktifkan kembali terlebih dahulu.",
          );
        if (input.supervisorId && input.supervisorId !== current.supervisorId) {
          await this.assertActiveSupervisor(tx, input.supervisorId);
        }
        if (input.supervisorId)
          await this.assertNoSupervisorCycle(tx, id, input.supervisorId);

        const plain = this.plainColumns(input);
        // Nilai sensitif null = tidak diubah (form tidak pernah mengisi ulang nilai lama)
        const sensitive = this.sensitiveColumns(ctx, input, {
          keepMissing: true,
        });
        await tx
          .update(employees)
          .set({ ...plain, ...sensitive })
          .where(eq(employees.id, id));

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(plain)) {
          const old: unknown = Reflect.get(current, key);
          if (old !== value) {
            before[key] = old;
            after[key] = value;
          }
        }
        // Isi nilai sensitif tidak pernah masuk audit log — hanya penanda bahwa nilainya diganti
        for (const key of ["nik", "npwp", "bankAccountNumber"] as const) {
          if (input[key]) after[key] = "(diubah)";
        }
        if (Object.keys(after).length > 0) {
          await this.audit.record(tx, ctx, {
            entity: "employee",
            entityId: id,
            action: "update",
            before,
            after,
          });
        }
      }),
    );
  }

  async deactivate(
    user: AuthUser,
    id: string,
    input: DeactivateEmployeeInput,
  ): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await this.manager(tx, ctx);
      const [current] = await tx
        .select({ joinDate: employees.joinDate, endDate: employees.endDate })
        .from(employees)
        .where(eq(employees.id, id))
        .for("update");
      if (!current) throw new NotFoundException(NOT_FOUND);
      if (current.endDate)
        throw new ConflictException("Karyawan ini sudah nonaktif");
      if (input.endDate < current.joinDate)
        throw new BadRequestException(
          "Tanggal keluar tidak boleh sebelum tanggal masuk",
        );

      await tx
        .update(employees)
        .set({ endDate: input.endDate, endReason: input.endReason })
        .where(eq(employees.id, id));
      await this.audit.record(tx, ctx, {
        entity: "employee",
        entityId: id,
        action: "deactivate",
        after: input,
      });
    });
  }

  async reactivate(user: AuthUser, id: string): Promise<void> {
    const ctx = tenantContextOf(user);
    await withTenant(this.db, ctx, async (tx) => {
      await this.manager(tx, ctx);
      const [current] = await tx
        .select({ endDate: employees.endDate, endReason: employees.endReason })
        .from(employees)
        .where(eq(employees.id, id))
        .for("update");
      if (!current) throw new NotFoundException(NOT_FOUND);
      if (!current.endDate)
        throw new ConflictException("Karyawan ini masih aktif");

      await tx
        .update(employees)
        .set({ endDate: null, endReason: null })
        .where(eq(employees.id, id));
      await this.audit.record(tx, ctx, {
        entity: "employee",
        entityId: id,
        action: "reactivate",
        before: current,
      });
    });
  }

  // Nilai sensitif penuh (tombol "Tampilkan") — owner/admin saja, setiap pemanggilan = satu catatan audit
  async reveal(
    user: AuthUser,
    id: string,
    section: SensitiveSection,
  ): Promise<RevealedSensitive> {
    const ctx = tenantContextOf(user);
    return withTenant(this.db, ctx, async (tx) => {
      await this.manager(tx, ctx);
      const [row] = await tx
        .select({
          nik: employees.nikEncrypted,
          npwp: employees.npwpEncrypted,
          bankAccount: employees.bankAccountEncrypted,
        })
        .from(employees)
        .where(eq(employees.id, id));
      if (!row) throw new NotFoundException(NOT_FOUND);
      const [actor] = ctx.userId
        ? await tx
            .select({ fullName: users.fullName })
            .from(users)
            .where(eq(users.id, ctx.userId))
        : [];

      await this.audit.record(tx, ctx, {
        entity: "employee",
        entityId: id,
        action: "reveal_sensitive",
        after: { section },
      });
      const revealedAt = new Date().toISOString();
      const revealedBy = actor?.fullName ?? "Pengguna";
      const open = (value: string | null, field: string) =>
        value
          ? this.cipher.decrypt(value, { tenantId: ctx.tenantId, field })
          : null;
      return section === "tax"
        ? {
            section,
            nik: open(row.nik, FIELD.nik),
            npwp: open(row.npwp, FIELD.npwp),
            revealedAt,
            revealedBy,
          }
        : {
            section,
            bankAccountNumber: open(row.bankAccount, FIELD.bankAccount),
            revealedAt,
            revealedBy,
          };
    });
  }

  // ——— helper ———

  private async viewer(tx: Transaction, ctx: TenantContext): Promise<Viewer> {
    if (!ctx.userId) throw new ForbiddenException(NO_ACCESS);
    // Filter tenant wajib: policy own_memberships_select juga memperlihatkan membership user di usaha lain
    const [membership] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, ctx.tenantId),
          eq(memberships.userId, ctx.userId),
        ),
      );
    if (!membership || membership.role === "karyawan")
      throw new ForbiddenException(NO_ACCESS);
    if (membership.role === "owner" || membership.role === "admin")
      return { role: membership.role, manage: true, ownEmployeeId: null };

    const [own] = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.userId, ctx.userId));
    return {
      role: membership.role,
      manage: false,
      ownEmployeeId: own?.id ?? null,
    };
  }

  // Dipakai juga EmployeeImportService (feature 12)
  async manager(tx: Transaction, ctx: TenantContext): Promise<Viewer> {
    const viewer = await this.viewer(tx, ctx);
    if (!viewer.manage)
      throw new ForbiddenException(
        "Hanya pemilik dan admin yang dapat mengelola data karyawan",
      );
    return viewer;
  }

  // Atasan tanpa data karyawan tertaut tidak punya bawahan → tidak melihat apa pun
  private scopeCondition(viewer: Viewer): SQL | undefined {
    if (viewer.manage) return undefined;
    return viewer.ownEmployeeId
      ? eq(employees.supervisorId, viewer.ownEmployeeId)
      : sql`false`;
  }

  private async assertActiveSupervisor(
    tx: Transaction,
    supervisorId: string,
  ): Promise<void> {
    const [row] = await tx
      .select({ endDate: employees.endDate })
      .from(employees)
      .where(eq(employees.id, supervisorId));
    if (!row)
      throw new BadRequestException(
        FOREIGN_KEY_MESSAGES.employees_supervisor_fk,
      );
    if (row.endDate)
      throw new BadRequestException(
        "Atasan langsung yang dipilih sudah nonaktif",
      );
  }

  // A atasan B, B atasan A → rantai tanpa ujung. Telusuri ke atas dari calon atasan; jika bertemu karyawan ini = siklus.
  private async assertNoSupervisorCycle(
    tx: Transaction,
    employeeId: string,
    supervisorId: string,
  ): Promise<void> {
    const result = await tx.execute<{ found: boolean }>(sql`
      with recursive chain(id, depth) as (
        select ${supervisorId}::uuid, 0
        union all
        select e.supervisor_id, c.depth + 1
        from ${employees} e join chain c on e.id = c.id
        where e.supervisor_id is not null and c.depth < 100
      )
      select exists(select 1 from chain where id = ${employeeId}::uuid) as found`);
    if (result.rows[0]?.found)
      throw new BadRequestException(
        "Atasan langsung tidak boleh bawahan dari karyawan ini",
      );
  }

  plainColumns(input: EmployeeInput) {
    return {
      fullName: input.fullName,
      employeeNumber: input.employeeNumber,
      email: input.email,
      phone: input.phone,
      birthDate: input.birthDate,
      gender: input.gender,
      departmentId: input.departmentId,
      positionId: input.positionId,
      supervisorId: input.supervisorId,
      userId: input.userId,
      joinDate: input.joinDate,
      employmentStatus: input.employmentStatus,
      contractEndDate: input.contractEndDate,
      probationEndDate: input.probationEndDate,
      ptkpStatus: input.ptkpStatus,
      bankCode: input.bankCode,
      bankAccountHolder: input.bankAccountHolder,
    };
  }

  // keepMissing (ubah): kolom sensitif yang tidak diisi tidak ikut di-SET sama sekali
  sensitiveColumns(
    ctx: TenantContext,
    input: EmployeeInput,
    { keepMissing = false } = {},
  ) {
    const context = (field: string): CipherContext => ({
      tenantId: ctx.tenantId,
      field,
    });
    const columns: {
      nikEncrypted?: string | null;
      nikHash?: string | null;
      npwpEncrypted?: string | null;
      bankAccountEncrypted?: string | null;
    } = {};
    if (input.nik || !keepMissing) {
      columns.nikEncrypted = input.nik
        ? this.cipher.encrypt(input.nik, context(FIELD.nik))
        : null;
      columns.nikHash = input.nik
        ? this.cipher.blindIndex(input.nik, context(FIELD.nik))
        : null;
    }
    if (input.npwp || !keepMissing)
      columns.npwpEncrypted = input.npwp
        ? this.cipher.encrypt(input.npwp, context(FIELD.npwp))
        : null;
    if (input.bankAccountNumber || !keepMissing) {
      columns.bankAccountEncrypted = input.bankAccountNumber
        ? this.cipher.encrypt(
            input.bankAccountNumber,
            context(FIELD.bankAccount),
          )
        : null;
    }
    return columns;
  }

  // Isi audit tanpa nilai sensitif
  // Blind index NIK (sama dengan kolom nik_hash) — cek duplikat tanpa mendekripsi
  nikHash(ctx: TenantContext, nik: string): string {
    return this.cipher.blindIndex(nik, { tenantId: ctx.tenantId, field: FIELD.nik });
  }

  auditView(input: EmployeeInput): Record<string, unknown> {
    const { nik, npwp, bankAccountNumber, ...rest } = input;
    return {
      ...rest,
      nik: nik ? "(diisi)" : null,
      npwp: npwp ? "(diisi)" : null,
      bankAccountNumber: bankAccountNumber ? "(diisi)" : null,
    };
  }

  private async mapConstraintErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      const unique = uniqueViolationConstraint(error);
      if (unique !== null)
        throw new ConflictException(
          UNIQUE_MESSAGES[unique] ?? "Data karyawan bentrok dengan data lain",
        );
      const foreignKey = foreignKeyViolationConstraint(error);
      if (foreignKey !== null)
        throw new BadRequestException(
          FOREIGN_KEY_MESSAGES[foreignKey] ?? "Data terkait tidak ditemukan",
        );
      throw error;
    }
  }
}
