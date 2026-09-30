import {
  ABSENCE_DEDUCTION_MODES,
  ATTENDANCE_ALLOWANCE_MODES,
  EMPLOYMENT_STATUSES,
  GENDERS,
  KPI_INDICATOR_TYPES,
  KPI_SYSTEM_METRICS,
  KPI_TARGET_PERIODS,
  LEAVE_ATTACHMENT_TYPES,
  LEAVE_REQUEST_STATUSES,
  LATE_DEDUCTION_MODES,
  LEAVE_TYPES,
  MEMBERSHIP_ROLES,
  NATIONAL_HOLIDAY_KINDS,
  PERMIT_SICK_DEDUCTION_MODES,
  PRORATE_BASES,
  PTKP_STATUSES,
  TASK_LOG_STATUSES,
  TASK_PHOTO_TYPES,
  WORKING_DAY_DIVISOR_MODES,
} from "@exapay/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Schema fondasi multi-tenant (feature 02).
// RLS policy, FORCE RLS, trigger updated_at, dan grant role app_user TIDAK bisa dinyatakan di sini —
// ditulis sebagai SQL di migration yang sama (lihat migrations/0000_*.sql).

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const membershipRole = pgEnum("membership_role", MEMBERSHIP_ROLES);

// Data referensi wilayah (feature 09) — tingkat platform, bukan data tenant: tanpa tenant_id, baca-saja untuk app_user.
// Kode & nama sesuai Kepmendagri No 300.2.2-2138 Tahun 2025 (di-seed lewat migration 0007).
export const provinces = pgTable("provinces", {
  // Kode Kemendagri 2 digit, mis. "73"
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  // Zona waktu IANA provinsi (WIB Asia/Jakarta · WITA Asia/Makassar · WIT Asia/Jayapura)
  timeZone: text("time_zone").notNull(),
});

export const regencies = pgTable(
  "regencies",
  {
    // Kode Kemendagri "PP.KK", mis. "73.71" (Kota Makassar)
    code: text("code").primaryKey(),
    provinceCode: text("province_code")
      .notNull()
      .references(() => provinces.code, { onDelete: "restrict" }),
    name: text("name").notNull(),
  },
  (t) => [index("regencies_province_code_idx").on(t.provinceCode)],
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Diisi super-admin (feature 07): anggota tenant tidak bisa login. Hanya super-admin yang boleh mengubah (trigger).
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    // Profil usaha (feature 09) — null sampai diisi owner/admin di /settings/company
    address: text("address"),
    // NPWP badan, hanya digit (15 lama / 16 digit sejak 2024). Identitas pajak perusahaan — tidak dienkripsi (bukan data pribadi).
    npwp: text("npwp"),
    // Kota/kabupaten lokasi usaha — dasar UMK (feature 34)
    regencyCode: text("regency_code").references(() => regencies.code, { onDelete: "restrict" }),
    // Tanggal gajian 1–31; bulan yang lebih pendek memakai hari terakhir bulan itu
    payday: smallint("payday"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("tenants_npwp_format", sql`${t.npwp} ~ '^[0-9]{15,16}$'`),
    check("tenants_payday_range", sql`${t.payday} between 1 and 31`),
  ],
);

// Akun platform (bukan tabel tenant): satu user bisa tergabung di beberapa tenant lewat memberships.
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    // null sampai user menetapkan password (mis. lewat undangan)
    passwordHash: text("password_hash"),
    fullName: text("full_name").notNull(),
    isSuperAdmin: boolean("is_super_admin").notNull().default(false),
    // null = email belum diverifikasi (signup owner, feature 05) → login ditolak
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("memberships_tenant_user_key").on(t.tenantId, t.userId),
    index("memberships_user_id_idx").on(t.userId),
  ],
);

// Append-only: app_user hanya diberi SELECT + INSERT (lihat migration). Tidak punya updated_at.
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_tenant_entity_idx").on(t.tenantId, t.entity, t.entityId),
    index("audit_logs_tenant_created_at_idx").on(t.tenantId, t.createdAt),
  ],
);

// Refresh token berotasi (feature 03). Token yang dikirim ke client adalah JWT berisi id baris ini (jti)
// dan family; baris menyimpan status pencabutan. Dipakai ulang setelah dirotasi → seluruh family dicabut.
// Level user (bukan tenant): RLS menyaring berdasarkan app.user_id.
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    // Tenant aktif yang dipertahankan saat refresh; null jika belum memilih tenant
    activeTenantId: uuid("active_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // Sudah ditukar dengan token baru (rotasi). Boleh dipakai ulang sebentar (request paralel).
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    // Dicabut (logout, reset password, deteksi pencurian) — tidak pernah berlaku lagi
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("refresh_tokens_user_id_idx").on(t.userId), index("refresh_tokens_family_id_idx").on(t.familyId)],
);

// Token reset password (feature 04). Hanya hash SHA-256 yang disimpan — token asli hanya ada di email.
// Level user: RLS per app.user_id; lookup by hash sebelum ada konteks lewat fungsi SECURITY DEFINER.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("password_reset_tokens_token_hash_key").on(t.tokenHash), index("password_reset_tokens_user_id_idx").on(t.userId)],
);

// Token verifikasi email signup (feature 05). Pola sama dengan password_reset_tokens: hanya hash SHA-256 disimpan,
// RLS per app.user_id, lookup by hash tanpa konteks lewat fungsi SECURITY DEFINER.
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("email_verification_tokens_token_hash_key").on(t.tokenHash),
    index("email_verification_tokens_user_id_idx").on(t.userId),
  ],
);

// Undangan bergabung ke tenant (feature 07: undangan pemilik oleh super-admin; feature 08: undangan dari tenant).
// Pola token sama dengan reset password: hanya hash SHA-256 disimpan. Tabel tenant biasa (RLS tenant_isolation);
// lookup by hash sebelum ada konteks lewat fungsi SECURITY DEFINER.
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    email: text("email").notNull(),
    // Nama dari pengundang — dipakai sebagai nama akun baru (bisa diubah penerima)
    fullName: text("full_name").notNull(),
    role: membershipRole("role").notNull(),
    tokenHash: text("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("invitations_token_hash_key").on(t.tokenHash),
    index("invitations_tenant_email_idx").on(t.tenantId, sql`lower(${t.email})`),
  ],
);

// Struktur organisasi (feature 10). Departemen & jabatan adalah dua daftar independen per tenant;
// karyawan (feature 11) memilih satu dari masing-masing. Nama unik per tenant, tidak peka huruf besar/kecil.
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("departments_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    // Target FK komposit dari employees — menjamin departemen berasal dari tenant yang sama (FK tidak melewati RLS)
    unique("departments_tenant_id_id_key").on(t.tenantId, t.id),
  ],
);

// Template KPI (feature 18) — didefinisikan sebelum positions karena jabatan menunjuk template yang dipakainya.
// builtin_key = asal template bawaan ("sales", "kasir", …) agar bawaan yang terhapus bisa ditambahkan kembali; salinan = null.
export const kpiTemplates = pgTable(
  "kpi_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    builtinKey: text("builtin_key"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("kpi_templates_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    uniqueIndex("kpi_templates_tenant_builtin_key").on(t.tenantId, t.builtinKey).where(sql`${t.builtinKey} IS NOT NULL`),
    unique("kpi_templates_tenant_id_id_key").on(t.tenantId, t.id),
  ],
);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Template KPI jabatan ini (feature 18) — satu jabatan maksimal satu template, satu template bisa banyak jabatan
    kpiTemplateId: uuid("kpi_template_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("positions_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    unique("positions_tenant_id_id_key").on(t.tenantId, t.id),
    index("positions_tenant_kpi_template_idx").on(t.tenantId, t.kpiTemplateId),
    // Template dihapus → jabatan tanpa template (migration: ON DELETE SET NULL (kpi_template_id) — tenant_id tetap)
    foreignKey({ name: "positions_kpi_template_fk", columns: [t.tenantId, t.kpiTemplateId], foreignColumns: [kpiTemplates.tenantId, kpiTemplates.id] }).onDelete(
      "set null",
    ),
  ],
);

export const kpiIndicatorType = pgEnum("kpi_indicator_type", KPI_INDICATOR_TYPES);
export const kpiTargetPeriod = pgEnum("kpi_target_period", KPI_TARGET_PERIODS);
export const kpiSystemMetric = pgEnum("kpi_system_metric", KPI_SYSTEM_METRICS);

// Indikator template KPI (feature 18). Kolom yang terisi bergantung tipe (CHECK kpi_indicators_type_fields):
// numeric/count → unit + target + target_period; rating → target = skala maks (5); system → system_metric + target persen.
// unique (tenant_id, id) = target FK komposit log tugas (feature 19).
export const kpiIndicators = pgTable(
  "kpi_indicators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    templateId: uuid("template_id").notNull(),
    sortOrder: smallint("sort_order").notNull(),
    name: text("name").notNull(),
    type: kpiIndicatorType("type").notNull(),
    unit: text("unit"),
    target: numeric("target", { precision: 18, scale: 2 }).notNull(),
    targetPeriod: kpiTargetPeriod("target_period"),
    systemMetric: kpiSystemMetric("system_metric"),
    weight: smallint("weight").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("kpi_indicators_tenant_template_idx").on(t.tenantId, t.templateId, t.sortOrder),
    unique("kpi_indicators_tenant_id_id_key").on(t.tenantId, t.id),
    foreignKey({ name: "kpi_indicators_template_fk", columns: [t.tenantId, t.templateId], foreignColumns: [kpiTemplates.tenantId, kpiTemplates.id] }).onDelete(
      "cascade",
    ),
    check("kpi_indicators_weight", sql`${t.weight} BETWEEN 1 AND 100`),
    check("kpi_indicators_target_positive", sql`${t.target} > 0`),
    check(
      "kpi_indicators_type_fields",
      sql`CASE ${t.type}
        WHEN 'numeric' THEN ${t.unit} IS NOT NULL AND ${t.targetPeriod} IS NOT NULL AND ${t.systemMetric} IS NULL
        WHEN 'count' THEN ${t.unit} IS NOT NULL AND ${t.targetPeriod} IS NOT NULL AND ${t.systemMetric} IS NULL AND ${t.target} = trunc(${t.target})
        WHEN 'rating' THEN ${t.unit} IS NULL AND ${t.targetPeriod} IS NULL AND ${t.systemMetric} IS NULL AND ${t.target} = 5
        WHEN 'system' THEN ${t.unit} IS NULL AND ${t.targetPeriod} IS NULL AND ${t.systemMetric} IS NOT NULL AND ${t.target} <= 100
      END`,
    ),
  ],
);

export const employmentStatus = pgEnum("employment_status", EMPLOYMENT_STATUSES);
export const employeeGender = pgEnum("employee_gender", GENDERS);
export const ptkpStatus = pgEnum("ptkp_status", PTKP_STATUSES);

// Karyawan (feature 11). Semua relasi memakai FK komposit (tenant_id, …) — pemeriksaan FK tidak melewati RLS,
// jadi tanpa ini karyawan bisa menunjuk departemen/atasan milik tenant lain.
// NIK, NPWP, nomor rekening: ciphertext AES-256-GCM dari API ("v1:<base64 iv|data|tag>", AAD = tenant + kolom).
// nik_hash = HMAC-SHA256 NIK (hex) untuk cek duplikat per tenant tanpa mendekripsi.
// Nonaktif = end_date terisi (tidak ada hard delete — riwayat absensi/payroll tetap merujuk karyawan).
export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeNumber: text("employee_number"),
    fullName: text("full_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    birthDate: date("birth_date", { mode: "string" }),
    gender: employeeGender("gender"),
    departmentId: uuid("department_id").notNull(),
    positionId: uuid("position_id").notNull(),
    // Atasan langsung = karyawan lain di tenant yang sama. Atasan (peran) melihat karyawan yang supervisor_id = data karyawan miliknya.
    supervisorId: uuid("supervisor_id"),
    // Akun login (anggota usaha) yang tertaut — satu akun untuk satu karyawan per tenant
    userId: uuid("user_id"),
    joinDate: date("join_date", { mode: "string" }).notNull(),
    employmentStatus: employmentStatus("employment_status").notNull(),
    contractEndDate: date("contract_end_date", { mode: "string" }),
    probationEndDate: date("probation_end_date", { mode: "string" }),
    nikEncrypted: text("nik_encrypted"),
    nikHash: text("nik_hash"),
    npwpEncrypted: text("npwp_encrypted"),
    ptkpStatus: ptkpStatus("ptkp_status").notNull(),
    bankCode: text("bank_code"),
    bankAccountEncrypted: text("bank_account_encrypted"),
    bankAccountHolder: text("bank_account_holder"),
    endDate: date("end_date", { mode: "string" }),
    endReason: text("end_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("employees_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("employees_tenant_number_key").on(t.tenantId, sql`lower(${t.employeeNumber})`).where(sql`${t.employeeNumber} IS NOT NULL`),
    uniqueIndex("employees_tenant_nik_hash_key").on(t.tenantId, t.nikHash).where(sql`${t.nikHash} IS NOT NULL`),
    uniqueIndex("employees_tenant_user_key").on(t.tenantId, t.userId).where(sql`${t.userId} IS NOT NULL`),
    index("employees_tenant_supervisor_idx").on(t.tenantId, t.supervisorId),
    index("employees_tenant_department_idx").on(t.tenantId, t.departmentId),
    index("employees_tenant_position_idx").on(t.tenantId, t.positionId),
    foreignKey({ name: "employees_department_fk", columns: [t.tenantId, t.departmentId], foreignColumns: [departments.tenantId, departments.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ name: "employees_position_fk", columns: [t.tenantId, t.positionId], foreignColumns: [positions.tenantId, positions.id] }).onDelete("restrict"),
    foreignKey({ name: "employees_supervisor_fk", columns: [t.tenantId, t.supervisorId], foreignColumns: [t.tenantId, t.id] }).onDelete("restrict"),
    // Membership dicabut → tautan akun dilepas (migration: ON DELETE SET NULL (user_id) — tenant_id tetap)
    foreignKey({ name: "employees_membership_fk", columns: [t.tenantId, t.userId], foreignColumns: [memberships.tenantId, memberships.userId] }).onDelete(
      "set null",
    ),
    check("employees_not_own_supervisor", sql`${t.supervisorId} IS NULL OR ${t.supervisorId} <> ${t.id}`),
    check(
      "employees_contract_end_date",
      sql`(${t.employmentStatus} = 'contract') = (${t.contractEndDate} IS NOT NULL) AND (${t.contractEndDate} IS NULL OR ${t.contractEndDate} >= ${t.joinDate})`,
    ),
    check(
      "employees_probation_end_date",
      sql`(${t.employmentStatus} = 'probation') = (${t.probationEndDate} IS NOT NULL) AND (${t.probationEndDate} IS NULL OR ${t.probationEndDate} >= ${t.joinDate})`,
    ),
    check("employees_end_date", sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.joinDate}`),
    check("employees_nik_hash_pair", sql`(${t.nikEncrypted} IS NULL) = (${t.nikHash} IS NULL)`),
  ],
);

// Jadwal kerja default per tenant (feature 13): tepat 7 baris (Senin=1 … Minggu=7), diisi saat tenant dibuat.
// Jam tetap tersimpan untuk hari libur agar kembali saat hari itu diaktifkan lagi. Tanpa shift malam (masuk < pulang).
export const workScheduleDays = pgTable(
  "work_schedule_days",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    weekday: smallint("weekday").notNull(),
    isWorkday: boolean("is_workday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "work_schedule_days_pkey", columns: [t.tenantId, t.weekday] }),
    check("work_schedule_days_weekday_range", sql`${t.weekday} between 1 and 7`),
    check("work_schedule_days_time_order", sql`${t.startTime} < ${t.endTime}`),
  ],
);

export const nationalHolidayKind = pgEnum("national_holiday_kind", NATIONAL_HOLIDAY_KINDS);

// Libur nasional & cuti bersama (feature 13) — data referensi platform sesuai SKB 3 Menteri, baca-saja untuk app_user,
// diisi lewat migration per tahun. Satu baris per tanggal.
export const nationalHolidays = pgTable("national_holidays", {
  date: date("date", { mode: "string" }).primaryKey(),
  name: text("name").notNull(),
  kind: nationalHolidayKind("kind").notNull(),
});

// Libur nasional/cuti bersama yang TIDAK diliburkan usaha (tetap masuk kerja). Tidak ada baris = diikuti.
export const nationalHolidayExclusions = pgTable(
  "national_holiday_exclusions",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" })
      .notNull()
      .references(() => nationalHolidays.date, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ name: "national_holiday_exclusions_pkey", columns: [t.tenantId, t.date] })],
);

// Libur khusus usaha (feature 13), mis. ulang tahun usaha. Satu libur per tanggal per tenant.
export const companyHolidays = pgTable(
  "company_holidays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("company_holidays_tenant_date_key").on(t.tenantId, t.date)],
);

// Absen masuk/pulang (feature 14): satu baris per karyawan per tanggal kerja (tanggal lokal zona waktu usaha).
// Jam selalu dari server. Jadwal & menit telat disimpan saat absen masuk (snapshot) — jadwal kerja tidak berversi,
// jadi perubahan jadwal kemudian tidak mengubah status telat hari yang sudah lewat. Koreksi owner/admin (feature 16) mengubah
// jam di baris ini (atau membuat baris untuk hari tanpa absen) + riwayat di attendance_corrections + audit log.
// Lokasi GPS opsional: dicatat bila browser memberi izin, tidak memblokir absen.
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    // Zona waktu IANA yang dipakai menghitung tanggal kerja & telat
    timeZone: text("time_zone").notNull(),
    // Jam jadwal hari itu; null = bukan hari kerja (libur / hari libur jadwal)
    scheduledStart: time("scheduled_start"),
    scheduledEnd: time("scheduled_end"),
    lateMinutes: integer("late_minutes").notNull().default(0),
    checkInAt: timestamp("check_in_at", { withTimezone: true }).notNull(),
    checkInLatitude: doublePrecision("check_in_latitude"),
    checkInLongitude: doublePrecision("check_in_longitude"),
    checkInAccuracy: doublePrecision("check_in_accuracy"),
    checkOutAt: timestamp("check_out_at", { withTimezone: true }),
    checkOutLatitude: doublePrecision("check_out_latitude"),
    checkOutLongitude: doublePrecision("check_out_longitude"),
    checkOutAccuracy: doublePrecision("check_out_accuracy"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target FK komposit attendance_corrections
    unique("attendance_records_tenant_id_id_key").on(t.tenantId, t.id),
    // Juga melayani filter tenant & riwayat per karyawan per rentang tanggal
    uniqueIndex("attendance_records_tenant_employee_date_key").on(t.tenantId, t.employeeId, t.workDate),
    foreignKey({ name: "attendance_records_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete(
      "restrict",
    ),
    check("attendance_records_late_minutes", sql`${t.lateMinutes} >= 0`),
    check("attendance_records_schedule_pair", sql`(${t.scheduledStart} IS NULL) = (${t.scheduledEnd} IS NULL)`),
    check("attendance_records_off_day_not_late", sql`${t.scheduledStart} IS NOT NULL OR ${t.lateMinutes} = 0`),
    check("attendance_records_check_out_order", sql`${t.checkOutAt} IS NULL OR ${t.checkOutAt} >= ${t.checkInAt}`),
    check(
      "attendance_records_check_in_location",
      sql`(${t.checkInLatitude} IS NULL) = (${t.checkInLongitude} IS NULL) AND (${t.checkInLatitude} IS NOT NULL OR ${t.checkInAccuracy} IS NULL)`,
    ),
    check(
      "attendance_records_check_out_location",
      sql`(${t.checkOutLatitude} IS NULL) = (${t.checkOutLongitude} IS NULL) AND (${t.checkOutLatitude} IS NOT NULL OR ${t.checkOutAccuracy} IS NULL)`,
    ),
    check(
      "attendance_records_check_out_location_needs_time",
      sql`${t.checkOutAt} IS NOT NULL OR ${t.checkOutLatitude} IS NULL`,
    ),
  ],
);

// Riwayat koreksi absensi oleh owner/admin (feature 16) — append-only (app_user hanya SELECT/INSERT).
// before_* null = hari itu belum ada absen (koreksi membuat baris absensi). Nama pengoreksi di-snapshot.
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    attendanceRecordId: uuid("attendance_record_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    beforeCheckInAt: timestamp("before_check_in_at", { withTimezone: true }),
    beforeCheckOutAt: timestamp("before_check_out_at", { withTimezone: true }),
    beforeLateMinutes: integer("before_late_minutes"),
    afterCheckInAt: timestamp("after_check_in_at", { withTimezone: true }).notNull(),
    afterCheckOutAt: timestamp("after_check_out_at", { withTimezone: true }),
    afterLateMinutes: integer("after_late_minutes").notNull(),
    reason: text("reason").notNull(),
    correctedByUserId: uuid("corrected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    correctedByName: text("corrected_by_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Riwayat per karyawan per tanggal; juga melayani filter tenant
    index("attendance_corrections_tenant_employee_date_idx").on(t.tenantId, t.employeeId, t.workDate),
    index("attendance_corrections_tenant_created_idx").on(t.tenantId, t.createdAt),
    foreignKey({
      name: "attendance_corrections_record_fk",
      columns: [t.tenantId, t.attendanceRecordId],
      foreignColumns: [attendanceRecords.tenantId, attendanceRecords.id],
    }).onDelete("restrict"),
    foreignKey({ name: "attendance_corrections_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete(
      "restrict",
    ),
    check("attendance_corrections_reason", sql`length(${t.reason}) > 0`),
    check("attendance_corrections_before_pair", sql`${t.beforeCheckInAt} IS NOT NULL OR (${t.beforeCheckOutAt} IS NULL AND ${t.beforeLateMinutes} IS NULL)`),
  ],
);

export const leaveType = pgEnum("leave_type", LEAVE_TYPES);
export const leaveRequestStatus = pgEnum("leave_request_status", LEAVE_REQUEST_STATUSES);

// Pengajuan izin/sakit/cuti (feature 15): rentang hari penuh, diajukan karyawan sendiri, diputuskan atasan langsung
// atau owner/admin. Tanpa DELETE — dibatalkan = status cancelled. Pengajuan aktif (menunggu/disetujui) satu karyawan
// tidak boleh beririsan (exclusion constraint di migration — btree_gist).
// Lampiran opsional di storage S3 (key diawali tenant_id); hanya metadata di sini.
export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").notNull(),
    type: leaveType("type").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    reason: text("reason").notNull(),
    status: leaveRequestStatus("status").notNull().default("pending"),
    attachmentKey: text("attachment_key"),
    attachmentName: text("attachment_name"),
    attachmentType: text("attachment_type", { enum: LEAVE_ATTACHMENT_TYPES }),
    attachmentSize: integer("attachment_size"),
    // Akun yang mengajukan (akun tertaut karyawan saat itu)
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Nama pemutus saat memutuskan (snapshot) — tetap terbaca walau aksesnya kemudian dicabut
    decidedByName: text("decided_by_name"),
    decisionNote: text("decision_note"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Pengajuan per karyawan per rentang tanggal; juga melayani filter tenant
    index("leave_requests_tenant_employee_start_idx").on(t.tenantId, t.employeeId, t.startDate),
    index("leave_requests_tenant_status_idx").on(t.tenantId, t.status, t.createdAt),
    foreignKey({ name: "leave_requests_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete(
      "restrict",
    ),
    check("leave_requests_date_order", sql`${t.endDate} >= ${t.startDate}`),
    check("leave_requests_max_range", sql`${t.endDate} - ${t.startDate} < 92`),
    check(
      "leave_requests_attachment",
      sql`(${t.attachmentKey} IS NULL) = (${t.attachmentName} IS NULL) AND (${t.attachmentKey} IS NULL) = (${t.attachmentType} IS NULL) AND (${t.attachmentKey} IS NULL) = (${t.attachmentSize} IS NULL)`,
    ),
    check(
      "leave_requests_decision",
      sql`(${t.status} IN ('approved', 'rejected')) = (${t.decidedAt} IS NOT NULL) AND (${t.decidedAt} IS NOT NULL OR (${t.decidedByUserId} IS NULL AND ${t.decidedByName} IS NULL AND ${t.decisionNote} IS NULL))`,
    ),
    check("leave_requests_cancelled", sql`(${t.status} = 'cancelled') = (${t.cancelledAt} IS NOT NULL)`),
  ],
);

export const absenceDeductionMode = pgEnum("absence_deduction_mode", ABSENCE_DEDUCTION_MODES);
export const prorateBase = pgEnum("prorate_base", PRORATE_BASES);
export const workingDayDivisorMode = pgEnum("working_day_divisor_mode", WORKING_DAY_DIVISOR_MODES);
export const lateDeductionMode = pgEnum("late_deduction_mode", LATE_DEDUCTION_MODES);
export const permitSickDeductionMode = pgEnum("permit_sick_deduction_mode", PERMIT_SICK_DEDUCTION_MODES);
export const attendanceAllowanceMode = pgEnum("attendance_allowance_mode", ATTENDANCE_ALLOWANCE_MODES);

// Aturan potongan absensi (feature 17): satu baris = satu versi aturan per usaha, berlaku effective_from..effective_to
// (inklusif; null = sampai diganti). Versi tidak beririsan (exclusion constraint di migration). Isi aturan tidak bisa
// diubah — app_user hanya boleh UPDATE effective_to (menutup versi) dan DELETE versi terjadwal yang tertimpa (dicek service).
// Kolom per jenis aturan hanya terisi sesuai mode-nya (CHECK). Uang numeric(18,2).
export const attendanceDeductionRules = pgTable(
  "attendance_deduction_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    // Alpa
    absenceMode: absenceDeductionMode("absence_mode").notNull(),
    absenceProrateBase: prorateBase("absence_prorate_base"),
    absenceDivisorMode: workingDayDivisorMode("absence_divisor_mode"),
    absenceDivisorDays: smallint("absence_divisor_days"),
    absenceAmountPerDay: numeric("absence_amount_per_day", { precision: 18, scale: 2 }),
    // Telat — late_amount = nominal per kejadian (per_occurrence) atau per blok (per_block)
    lateMode: lateDeductionMode("late_mode").notNull(),
    lateToleranceMinutes: smallint("late_tolerance_minutes"),
    lateBlockMinutes: smallint("late_block_minutes"),
    lateAmount: numeric("late_amount", { precision: 18, scale: 2 }),
    lateMonthlyCap: numeric("late_monthly_cap", { precision: 18, scale: 2 }),
    // Izin & sakit
    permitSickMode: permitSickDeductionMode("permit_sick_mode").notNull(),
    permitSickFreeDays: smallint("permit_sick_free_days"),
    // Tunjangan kehadiran
    allowanceMode: attendanceAllowanceMode("allowance_mode").notNull(),
    allowanceMinAbsentDays: smallint("allowance_min_absent_days"),
    allowanceAmountPerDay: numeric("allowance_amount_per_day", { precision: 18, scale: 2 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Nama penyimpan (snapshot) — tetap terbaca walau aksesnya kemudian dicabut
    createdByName: text("created_by_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Cari versi yang berlaku di tanggal tertentu; juga melayani filter tenant
    index("attendance_deduction_rules_tenant_from_idx").on(t.tenantId, t.effectiveFrom),
    check("attendance_deduction_rules_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check(
      "attendance_deduction_rules_absence",
      sql`CASE ${t.absenceMode}
        WHEN 'none' THEN ${t.absenceProrateBase} IS NULL AND ${t.absenceDivisorMode} IS NULL AND ${t.absenceDivisorDays} IS NULL AND ${t.absenceAmountPerDay} IS NULL
        WHEN 'prorate' THEN ${t.absenceProrateBase} IS NOT NULL AND ${t.absenceDivisorMode} IS NOT NULL AND ${t.absenceAmountPerDay} IS NULL
          AND (${t.absenceDivisorMode} = 'fixed') = (${t.absenceDivisorDays} IS NOT NULL) AND coalesce(${t.absenceDivisorDays} BETWEEN 1 AND 31, true)
        WHEN 'fixed_per_day' THEN ${t.absenceProrateBase} IS NULL AND ${t.absenceDivisorMode} IS NULL AND ${t.absenceDivisorDays} IS NULL AND ${t.absenceAmountPerDay} > 0
      END`,
    ),
    check(
      "attendance_deduction_rules_late",
      sql`CASE ${t.lateMode}
        WHEN 'none' THEN ${t.lateToleranceMinutes} IS NULL AND ${t.lateBlockMinutes} IS NULL AND ${t.lateAmount} IS NULL AND ${t.lateMonthlyCap} IS NULL
        ELSE ${t.lateToleranceMinutes} BETWEEN 0 AND 240 AND ${t.lateAmount} > 0 AND coalesce(${t.lateMonthlyCap} > 0, true)
          AND (${t.lateMode} = 'per_block') = (${t.lateBlockMinutes} IS NOT NULL) AND coalesce(${t.lateBlockMinutes} BETWEEN 1 AND 240, true)
      END`,
    ),
    check(
      "attendance_deduction_rules_permit_sick",
      sql`(${t.permitSickMode} = 'after_days') = (${t.permitSickFreeDays} IS NOT NULL) AND coalesce(${t.permitSickFreeDays} BETWEEN 0 AND 31, true)
        AND (${t.permitSickMode} = 'none' OR ${t.absenceMode} <> 'none')`,
    ),
    check(
      "attendance_deduction_rules_allowance",
      sql`(${t.allowanceMode} = 'forfeit') = (${t.allowanceMinAbsentDays} IS NOT NULL) AND coalesce(${t.allowanceMinAbsentDays} BETWEEN 1 AND 31, true)
        AND (${t.allowanceMode} = 'reduce_per_day') = (${t.allowanceAmountPerDay} IS NOT NULL) AND coalesce(${t.allowanceAmountPerDay} > 0, true)`,
    ),
  ],
);

export const taskLogStatus = pgEnum("task_log_status", TASK_LOG_STATUSES);

// Log tugas harian karyawan (feature 19). Satu baris = satu catatan pekerjaan di satu tanggal kerja: realisasi indikator
// template jabatan (numeric/count, quantity terisi) ATAU pekerjaan lain (indicator_id null, note wajib — tidak masuk skor).
// Boleh banyak baris per indikator per hari. FK komposit ke attendance_records (tenant, karyawan, tanggal) = wajib sudah
// absen masuk di tanggal itu (baris absensi tidak pernah dihapus). FK ke indikator RESTRICT: indikator yang sudah punya log
// tidak bisa dihapus (template KPI → 409). Diverifikasi atasan di feature 20 (status; kolom keputusan menyusul).
// Foto bukti opsional di storage S3 (key diawali tenant_id); hanya metadata di sini.
export const taskLogs = pgTable(
  "task_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    indicatorId: uuid("indicator_id"),
    quantity: numeric("quantity", { precision: 18, scale: 2 }),
    note: text("note"),
    photoKey: text("photo_key"),
    photoType: text("photo_type", { enum: TASK_PHOTO_TYPES }),
    photoSize: integer("photo_size"),
    status: taskLogStatus("status").notNull().default("pending"),
    // Akun yang mencatat (akun tertaut karyawan saat itu)
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target FK komposit verifikasi (feature 20)
    unique("task_logs_tenant_id_id_key").on(t.tenantId, t.id),
    // Log per karyawan per tanggal; juga melayani filter tenant
    index("task_logs_tenant_employee_date_idx").on(t.tenantId, t.employeeId, t.workDate),
    // Pemeriksaan FK RESTRICT saat indikator dihapus
    index("task_logs_tenant_indicator_idx").on(t.tenantId, t.indicatorId),
    foreignKey({
      name: "task_logs_attendance_fk",
      columns: [t.tenantId, t.employeeId, t.workDate],
      foreignColumns: [attendanceRecords.tenantId, attendanceRecords.employeeId, attendanceRecords.workDate],
    }).onDelete("restrict"),
    foreignKey({ name: "task_logs_indicator_fk", columns: [t.tenantId, t.indicatorId], foreignColumns: [kpiIndicators.tenantId, kpiIndicators.id] }).onDelete(
      "restrict",
    ),
    check(
      "task_logs_kind",
      sql`(${t.indicatorId} IS NULL) = (${t.quantity} IS NULL) AND (${t.indicatorId} IS NOT NULL OR ${t.note} IS NOT NULL)`,
    ),
    check("task_logs_quantity_positive", sql`${t.quantity} IS NULL OR ${t.quantity} > 0`),
    check("task_logs_note_length", sql`${t.note} IS NULL OR char_length(${t.note}) BETWEEN 1 AND 500`),
    check(
      "task_logs_photo",
      sql`(${t.photoKey} IS NULL) = (${t.photoType} IS NULL) AND (${t.photoKey} IS NULL) = (${t.photoSize} IS NULL) AND coalesce(${t.photoSize} > 0, true)`,
    ),
  ],
);
