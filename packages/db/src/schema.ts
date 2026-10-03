import {
  ABSENCE_DEDUCTION_MODES,
  AI_GENERATION_STATUSES,
  ATTENDANCE_ALLOWANCE_MODES,
  ATTENDANCE_EVENTS,
  ATTENDANCE_REVIEW_DECISIONS,
  ATTENDANCE_REVIEW_SUBJECTS,
  BILLING_DECISION_SOURCES,
  BILLING_INVOICE_STATUSES,
  BPJS_PROGRAMS,
  COMPLIANCE_DEADLINE_KINDS,
  COMPLIANCE_REMINDER_KINDS,
  DEFAULT_AI_SUMMARY_MONTHLY_QUOTA,
  EMPLOYEE_LOCATION_MODES,
  EMPLOYEE_SCHEDULE_MODES,
  EMPLOYMENT_STATUSES,
  GEOFENCE_STATUSES,
  GENDERS,
  KPI_INDICATOR_TYPES,
  KPI_PREDICATES,
  KPI_RATING_SCALE_MAX,
  KPI_REVIEW_CYCLES,
  KPI_REVIEW_STATUSES,
  KPI_SUMMARY_MAX_LENGTH,
  KPI_SUMMARY_SOURCES,
  KPI_SYSTEM_METRICS,
  KPI_TARGET_PERIODS,
  LEAVE_ATTACHMENT_TYPES,
  LEAVE_REQUEST_STATUSES,
  LATE_DEDUCTION_MODES,
  LEAVE_TYPES,
  MEMBERSHIP_ROLES,
  NATIONAL_HOLIDAY_KINDS,
  PAYROLL_ADJUSTMENT_KINDS,
  PAYROLL_COMPONENT_KINDS,
  PAYROLL_RUN_STATUSES,
  PAYSLIP_EMAIL_STATUSES,
  PAYSLIP_STATUSES,
  PERMIT_SICK_DEDUCTION_MODES,
  PRORATE_BASES,
  PTKP_STATUSES,
  SUBSCRIPTION_NOTICE_KINDS,
  SUBSCRIPTION_STATUSES,
  TASK_LOG_STATUSES,
  TAX_RATE_KINDS,
  TASK_PHOTO_TYPES,
  WORKING_DAY_DIVISOR_MODES,
} from "@exapay/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
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
export const kpiReviewCycle = pgEnum("kpi_review_cycle", KPI_REVIEW_CYCLES);

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
    // Siklus penilaian KPI periodik (feature 22, /settings/kpi) — hanya memengaruhi periode yang dibuat berikutnya
    kpiReviewCycle: kpiReviewCycle("kpi_review_cycle").notNull().default("monthly"),
    // Kuota generate ringkasan AI per bulan (feature 23). Hanya super-admin/app_owner yang boleh mengubah (trigger)
    aiSummaryMonthlyQuota: integer("ai_summary_monthly_quota").notNull().default(DEFAULT_AI_SUMMARY_MONTHLY_QUOTA),
    // Kelompok risiko JKK usaha 1–5 (PP 44/2015; feature 28, /settings/salary-components). Default 1 = sangat rendah
    // (kantor, toko — mayoritas UMKM); tarifnya dari bpjs_rates.
    jkkRiskLevel: smallint("jkk_risk_level").notNull().default(1),
    // Tanggal tutup buku absensi payroll (feature 30b): 1–28; null = akhir bulan
    attendanceCutoffDay: smallint("attendance_cutoff_day"),
    // Tampilkan peringatan gaji di bawah upah minimum (UMK/UMP, feature 34) di dashboard, kepatuhan, daftar karyawan.
    // Bawaan mati — hanya owner yang menyalakan (/settings/company). Usaha mikro & kecil dikecualikan dari upah minimum.
    minimumWageAlerts: boolean("minimum_wage_alerts").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("tenants_npwp_format", sql`${t.npwp} ~ '^[0-9]{15,16}$'`),
    check("tenants_payday_range", sql`${t.payday} between 1 and 31`),
    check("tenants_ai_summary_monthly_quota", sql`${t.aiSummaryMonthlyQuota} >= 0`),
    check("tenants_jkk_risk_level", sql`${t.jkkRiskLevel} BETWEEN 1 AND 5`),
    check("tenants_attendance_cutoff_day", sql`${t.attendanceCutoffDay} BETWEEN 1 AND 28`),
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
export const employeeLocationMode = pgEnum("employee_location_mode", EMPLOYEE_LOCATION_MODES);
export const employeeScheduleMode = pgEnum("employee_schedule_mode", EMPLOYEE_SCHEDULE_MODES);

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
    // Pengecekan lokasi absen (feature 44): all = semua lokasi kerja, selected = employee_work_locations, exempt = tidak dicek
    locationMode: employeeLocationMode("location_mode").notNull().default("all"),
    // Selfie wajib saat absen masuk/pulang (feature 45) — default aktif untuk karyawan baru & lama
    selfieRequired: boolean("selfie_required").notNull().default(true),
    // Mode jadwal (feature 46): business = jadwal mingguan usaha (default), shift = dijadwalkan per tanggal di roster
    scheduleMode: employeeScheduleMode("schedule_mode").notNull().default("business"),
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
export const attendanceGeofenceStatus = pgEnum("attendance_geofence_status", GEOFENCE_STATUSES);

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
    // Geofence (feature 44) — snapshot saat absen; null = tidak dicek. Jarak ke pusat lokasi terdekat + nama lokasi saat itu
    checkInGeofence: attendanceGeofenceStatus("check_in_geofence"),
    checkInDistanceM: integer("check_in_distance_m"),
    checkInLocationName: text("check_in_location_name"),
    checkOutGeofence: attendanceGeofenceStatus("check_out_geofence"),
    checkOutDistanceM: integer("check_out_distance_m"),
    checkOutLocationName: text("check_out_location_name"),
    // Selfie bukti kehadiran (feature 45) — file di storage `attendance-selfies/<id>/…`. Worker menghapus file setelah
    // 90 hari: key jadi null, type tetap (tanda "foto sudah dihapus"). Koreksi absensi tidak mengubah selfie.
    checkInSelfieKey: text("check_in_selfie_key"),
    checkInSelfieType: text("check_in_selfie_type", { enum: TASK_PHOTO_TYPES }),
    checkOutSelfieKey: text("check_out_selfie_key"),
    checkOutSelfieType: text("check_out_selfie_type", { enum: TASK_PHOTO_TYPES }),
    // Absensi berbasis roster (feature 47): nama shift yang dicocokkan saat absen masuk (snapshot, jam di scheduled_start/end;
    // shift malam = scheduled_end ≤ scheduled_start, tanggal kerja = tanggal mulai). unscheduled = karyawan mode shift absen
    // masuk di hari tanpa shift → tanda "Tanpa jadwal" untuk ditinjau (bukan hari kerja, tidak telat).
    shiftName: text("shift_name"),
    unscheduled: boolean("unscheduled").notNull().default(false),
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
    // Tanpa status → tanpa jarak/nama; no_location → tanpa jarak/nama; status lain → jarak & nama terisi
    check(
      "attendance_records_check_in_geofence",
      sql`CASE WHEN ${t.checkInGeofence} IS NULL OR ${t.checkInGeofence} = 'no_location' THEN ${t.checkInDistanceM} IS NULL AND ${t.checkInLocationName} IS NULL ELSE ${t.checkInDistanceM} IS NOT NULL AND ${t.checkInDistanceM} >= 0 AND ${t.checkInLocationName} IS NOT NULL END`,
    ),
    check(
      "attendance_records_check_out_geofence",
      sql`CASE WHEN ${t.checkOutGeofence} IS NULL OR ${t.checkOutGeofence} = 'no_location' THEN ${t.checkOutDistanceM} IS NULL AND ${t.checkOutLocationName} IS NULL ELSE ${t.checkOutDistanceM} IS NOT NULL AND ${t.checkOutDistanceM} >= 0 AND ${t.checkOutLocationName} IS NOT NULL END`,
    ),
    check("attendance_records_check_out_geofence_needs_time", sql`${t.checkOutAt} IS NOT NULL OR ${t.checkOutGeofence} IS NULL`),
    check(
      "attendance_records_check_in_selfie",
      sql`(${t.checkInSelfieKey} IS NULL OR ${t.checkInSelfieType} IS NOT NULL) AND coalesce(${t.checkInSelfieType} IN ('image/jpeg', 'image/png', 'image/webp'), true)`,
    ),
    check(
      "attendance_records_check_out_selfie",
      sql`(${t.checkOutSelfieKey} IS NULL OR ${t.checkOutSelfieType} IS NOT NULL) AND coalesce(${t.checkOutSelfieType} IN ('image/jpeg', 'image/png', 'image/webp'), true)`,
    ),
    check("attendance_records_shift_name", sql`${t.shiftName} IS NULL OR (length(${t.shiftName}) BETWEEN 1 AND 40 AND ${t.scheduledStart} IS NOT NULL)`),
    check("attendance_records_unscheduled", sql`NOT ${t.unscheduled} OR (${t.scheduledStart} IS NULL AND ${t.shiftName} IS NULL)`),
    // Antrean tinjauan: absen bertanda per tenant per tanggal
    index("attendance_records_tenant_flagged_idx")
      .on(t.tenantId, t.workDate)
      .where(sql`${t.checkInGeofence} IN ('outside', 'inaccurate', 'no_location') OR ${t.checkOutGeofence} IN ('outside', 'inaccurate', 'no_location')`),
    // Penghapusan selfie > 90 hari oleh worker (lintas tenant lewat fungsi definer, lalu per tenant)
    index("attendance_records_selfie_retention_idx")
      .on(t.workDate, t.tenantId)
      .where(sql`${t.checkInSelfieKey} IS NOT NULL OR ${t.checkOutSelfieKey} IS NOT NULL`),
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

// Lokasi kerja usaha (feature 44): titik pusat + radius. Absen dicek ke lokasi terdekat; status disimpan sebagai snapshot
// di attendance_records, jadi mengubah/menghapus lokasi tidak mengubah absen lama.
export const workLocations = pgTable(
  "work_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    address: text("address"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radiusM: integer("radius_m").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("work_locations_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("work_locations_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    check("work_locations_name", sql`length(${t.name}) BETWEEN 1 AND 80`),
    check("work_locations_latitude", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("work_locations_longitude", sql`${t.longitude} BETWEEN -180 AND 180`),
    check("work_locations_radius", sql`${t.radiusM} BETWEEN 25 AND 1000`),
  ],
);

// Lokasi terpilih untuk karyawan mode "selected" (feature 44). Lokasi dihapus → barisnya ikut terhapus.
export const employeeWorkLocations = pgTable(
  "employee_work_locations",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").notNull(),
    workLocationId: uuid("work_location_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "employee_work_locations_pkey", columns: [t.tenantId, t.employeeId, t.workLocationId] }),
    index("employee_work_locations_tenant_location_idx").on(t.tenantId, t.workLocationId),
    foreignKey({ name: "employee_work_locations_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      name: "employee_work_locations_location_fk",
      columns: [t.tenantId, t.workLocationId],
      foreignColumns: [workLocations.tenantId, workLocations.id],
    }).onDelete("cascade"),
  ],
);

// Master shift (feature 46): nama + jam mulai–selesai; selesai ≤ mulai = melewati tengah malam. Opsional per usaha.
export const workShifts = pgTable(
  "work_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("work_shifts_tenant_id_id_key").on(t.tenantId, t.id),
    uniqueIndex("work_shifts_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    check("work_shifts_name", sql`length(${t.name}) BETWEEN 1 AND 40`),
    check("work_shifts_times", sql`${t.startTime} <> ${t.endTime}`),
  ],
);

// Roster (feature 46): satu baris per karyawan per tanggal — shift (snapshot nama & jam saat dijadwalkan, agar absensi &
// payroll final tidak berubah bila master shift diubah/dihapus) atau libur (semua kolom shift null). Tanpa baris = belum diatur.
// Master shift dihapus → work_shift_id null, snapshot tetap.
export const shiftRosterDays = pgTable(
  "shift_roster_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").notNull(),
    workDate: date("work_date", { mode: "string" }).notNull(),
    workShiftId: uuid("work_shift_id"),
    shiftName: text("shift_name"),
    startTime: time("start_time"),
    endTime: time("end_time"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Juga melayani filter tenant & roster per karyawan per rentang tanggal
    uniqueIndex("shift_roster_days_tenant_employee_date_key").on(t.tenantId, t.employeeId, t.workDate),
    index("shift_roster_days_tenant_shift_idx").on(t.tenantId, t.workShiftId),
    foreignKey({ name: "shift_roster_days_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete(
      "restrict",
    ),
    // ON DELETE SET NULL (work_shift_id) ditulis manual di migration — Drizzle belum mendukung daftar kolom SET NULL
    foreignKey({ name: "shift_roster_days_shift_fk", columns: [t.tenantId, t.workShiftId], foreignColumns: [workShifts.tenantId, workShifts.id] }),
    check(
      "shift_roster_days_entry",
      sql`(${t.shiftName} IS NULL) = (${t.startTime} IS NULL) AND (${t.startTime} IS NULL) = (${t.endTime} IS NULL) AND (${t.shiftName} IS NOT NULL OR ${t.workShiftId} IS NULL) AND coalesce(${t.startTime} <> ${t.endTime}, true)`,
    ),
  ],
);

export const attendanceEvent = pgEnum("attendance_event", ATTENDANCE_EVENTS);
export const attendanceReviewSubject = pgEnum("attendance_review_subject", ATTENDANCE_REVIEW_SUBJECTS);
export const attendanceReviewDecision = pgEnum("attendance_review_decision", ATTENDANCE_REVIEW_DECISIONS);

// Keputusan tinjauan absen bertanda (feature 44): satu baris per absen masuk/pulang, boleh diubah (keputusan terakhir menang,
// riwayat di audit log). Tidak mengubah jam/gaji — koreksi tetap lewat attendance_corrections. Nama peninjau di-snapshot.
export const attendanceReviews = pgTable(
  "attendance_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    attendanceRecordId: uuid("attendance_record_id").notNull(),
    event: attendanceEvent("event").notNull(),
    // location = tanda geofence (feature 44); schedule = tanda "Tanpa jadwal" absen masuk (feature 47)
    subject: attendanceReviewSubject("subject").notNull().default("location"),
    decision: attendanceReviewDecision("decision").notNull(),
    note: text("note"),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("attendance_reviews_tenant_record_event_subject_key").on(t.tenantId, t.attendanceRecordId, t.event, t.subject),
    foreignKey({
      name: "attendance_reviews_record_fk",
      columns: [t.tenantId, t.attendanceRecordId],
      foreignColumns: [attendanceRecords.tenantId, attendanceRecords.id],
    }).onDelete("restrict"),
    check("attendance_reviews_note", sql`${t.note} IS NULL OR length(${t.note}) BETWEEN 1 AND 500`),
    check("attendance_reviews_follow_up_note", sql`${t.decision} <> 'follow_up' OR ${t.note} IS NOT NULL`),
    check("attendance_reviews_schedule_check_in", sql`${t.subject} <> 'schedule' OR ${t.event} = 'check_in'`),
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
    // Terakhir diubah karyawan (updated_at ikut berubah saat diverifikasi)
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Verifikasi atasan (feature 20). verified_quantity = realisasi yang diakui (angka karyawan atau koreksi atasan);
    // hanya catatan indikator yang disetujui — satu-satunya angka yang masuk skor KPI (feature 21). quantity = angka asli karyawan.
    verifiedQuantity: numeric("verified_quantity", { precision: 18, scale: 2 }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Snapshot nama pemutus (dibaca karyawan)
    decidedByName: text("decided_by_name"),
    // Alasan tolak / koreksi (wajib), catatan setuju (opsional)
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target FK komposit verifikasi (feature 20)
    unique("task_logs_tenant_id_id_key").on(t.tenantId, t.id),
    // Log per karyawan per tanggal; juga melayani filter tenant
    index("task_logs_tenant_employee_date_idx").on(t.tenantId, t.employeeId, t.workDate),
    // Daftar verifikasi per status (menunggu: tanggal terlama dulu)
    index("task_logs_tenant_status_date_idx").on(t.tenantId, t.status, t.workDate),
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
    // Diputuskan ⇔ decided_at terisi; menunggu tanpa jejak keputusan
    check(
      "task_logs_decision",
      sql`(${t.status} <> 'pending') = (${t.decidedAt} IS NOT NULL) AND (${t.decidedAt} IS NOT NULL OR (${t.decidedByUserId} IS NULL AND ${t.decidedByName} IS NULL AND ${t.decisionNote} IS NULL))`,
    ),
    // Realisasi diakui hanya untuk catatan indikator yang disetujui
    check(
      "task_logs_verified_quantity",
      sql`(${t.verifiedQuantity} IS NOT NULL) = (${t.status} = 'approved' AND ${t.indicatorId} IS NOT NULL) AND coalesce(${t.verifiedQuantity} > 0, true)`,
    ),
    // Tolak & koreksi wajib beralasan
    check(
      "task_logs_decision_note",
      sql`(${t.decisionNote} IS NULL OR char_length(${t.decisionNote}) BETWEEN 1 AND 500) AND (${t.status} <> 'rejected' OR ${t.decisionNote} IS NOT NULL) AND (${t.verifiedQuantity} IS NULL OR ${t.verifiedQuantity} = ${t.quantity} OR ${t.decisionNote} IS NOT NULL)`,
    ),
  ],
);

export const kpiReviewStatus = pgEnum("kpi_review_status", KPI_REVIEW_STATUSES);

// Periode penilaian KPI periodik (feature 22). Dibuat owner/admin dari periode siklus usaha yang sudah berakhir;
// cycle = siklus saat dibuat (siklus usaha bisa berubah sesudahnya). Periode satu usaha tidak boleh beririsan —
// exclusion constraint kpi_review_periods_no_overlap (GiST) ditulis di migration. Tanpa UPDATE/DELETE untuk app_user.
export const kpiReviewPeriods = pgTable(
  "kpi_review_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    cycle: kpiReviewCycle("cycle").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Target FK komposit kpi_reviews
    unique("kpi_review_periods_tenant_id_id_key").on(t.tenantId, t.id),
    // Daftar periode terbaru dulu; juga melayani filter tenant
    index("kpi_review_periods_tenant_start_idx").on(t.tenantId, t.startDate),
    check("kpi_review_periods_date_order", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

// Penilaian KPI satu karyawan untuk satu periode (feature 22). draft → reviewed (dikirim atasan/owner/admin) → final
// (owner/admin). Skor draft/reviewed dihitung saat dibaca; final menyimpan snapshot (skor + rincian + nama) dan TERKUNCI —
// trigger kpi_reviews_guard_final menolak UPDATE/DELETE baris final. Nilai indikator penilaian atasan di kpi_review_ratings.
export const kpiReviews = pgTable(
  "kpi_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    periodId: uuid("period_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    status: kpiReviewStatus("status").notNull().default("draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Snapshot nama (tetap terbaca walau akses pengguna dicabut)
    submittedByName: text("submitted_by_name"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedByUserId: uuid("finalized_by_user_id").references(() => users.id, { onDelete: "set null" }),
    finalizedByName: text("finalized_by_name"),
    // Skor final 0–100 (1 desimal); null = final tanpa indikator yang bisa dihitung (mis. cuti sepanjang periode)
    finalScore: numeric("final_score", { precision: 4, scale: 1 }),
    finalPredicate: text("final_predicate", { enum: KPI_PREDICATES }),
    // KpiReviewSnapshot (@exapay/shared) — divalidasi zod saat dibaca
    snapshot: jsonb("snapshot"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("kpi_reviews_tenant_id_id_key").on(t.tenantId, t.id),
    // Satu penilaian per karyawan per periode; juga melayani filter tenant & daftar per periode
    unique("kpi_reviews_tenant_period_employee_key").on(t.tenantId, t.periodId, t.employeeId),
    index("kpi_reviews_tenant_employee_idx").on(t.tenantId, t.employeeId),
    foreignKey({ name: "kpi_reviews_period_fk", columns: [t.tenantId, t.periodId], foreignColumns: [kpiReviewPeriods.tenantId, kpiReviewPeriods.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ name: "kpi_reviews_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete("restrict"),
    // Dikirim ⇔ bukan draft; final ⇔ finalized_at + snapshot terisi; skor & predikat hanya di final, terisi bersamaan
    check("kpi_reviews_submitted", sql`(${t.status} <> 'draft') = (${t.submittedAt} IS NOT NULL)`),
    check(
      "kpi_reviews_final",
      sql`(${t.status} = 'final') = (${t.finalizedAt} IS NOT NULL) AND (${t.status} = 'final') = (${t.snapshot} IS NOT NULL)
        AND (${t.finalScore} IS NULL) = (${t.finalPredicate} IS NULL) AND (${t.status} = 'final' OR ${t.finalScore} IS NULL)
        AND coalesce(${t.finalScore} BETWEEN 0 AND 100, true)`,
    ),
    check("kpi_reviews_final_predicate", sql`${t.finalPredicate} IS NULL OR ${t.finalPredicate} IN ('very_good', 'good', 'fair', 'needs_improvement')`),
  ],
);

// Nilai atasan per indikator penilaian (tipe rating) untuk penilaian yang belum final (feature 22). Indikator dihapus dari
// template → nilainya ikut terhapus (CASCADE); penilaian final tidak terpengaruh karena memakai snapshot.
export const kpiReviewRatings = pgTable(
  "kpi_review_ratings",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    reviewId: uuid("review_id").notNull(),
    indicatorId: uuid("indicator_id").notNull(),
    rating: smallint("rating").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Juga melayani filter tenant
    primaryKey({ name: "kpi_review_ratings_pkey", columns: [t.tenantId, t.reviewId, t.indicatorId] }),
    // Pemeriksaan CASCADE saat indikator dihapus
    index("kpi_review_ratings_tenant_indicator_idx").on(t.tenantId, t.indicatorId),
    foreignKey({ name: "kpi_review_ratings_review_fk", columns: [t.tenantId, t.reviewId], foreignColumns: [kpiReviews.tenantId, kpiReviews.id] }).onDelete(
      "cascade",
    ),
    foreignKey({ name: "kpi_review_ratings_indicator_fk", columns: [t.tenantId, t.indicatorId], foreignColumns: [kpiIndicators.tenantId, kpiIndicators.id] }).onDelete(
      "cascade",
    ),
    check("kpi_review_ratings_range", sql`${t.rating} BETWEEN 1 AND ${sql.raw(String(KPI_RATING_SCALE_MAX))}`),
  ],
);

export const aiGenerationStatus = pgEnum("ai_generation_status", AI_GENERATION_STATUSES);
export const kpiSummarySource = pgEnum("kpi_summary_source", KPI_SUMMARY_SOURCES);

// Satu permintaan generate AI (feature 23): input terstruktur, output, versi prompt, model, token — jejak lengkap agar
// narasi bisa dijelaskan. Dibuat API (queued) lalu diproses worker lewat antrean BullMQ (running → succeeded/failed).
// Kuota bulanan = jumlah baris bukan failed di bulan berjalan (zona waktu usaha). Tanpa DELETE.
export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    reviewId: uuid("review_id").notNull(),
    status: aiGenerationStatus("status").notNull().default("queued"),
    // KpiSummaryInput (@exapay/shared) — tanpa nama/identitas karyawan
    input: jsonb("input").notNull(),
    output: text("output"),
    // Pesan aman untuk pengguna (detail teknis hanya di log worker)
    error: text("error"),
    // Diisi worker saat memproses
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    attempts: smallint("attempts").notNull().default(0),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    requestedByName: text("requested_by_name"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("ai_generations_tenant_id_id_key").on(t.tenantId, t.id),
    // Hitung kuota bulan berjalan; juga melayani filter tenant
    index("ai_generations_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("ai_generations_tenant_review_idx").on(t.tenantId, t.reviewId),
    foreignKey({ name: "ai_generations_review_fk", columns: [t.tenantId, t.reviewId], foreignColumns: [kpiReviews.tenantId, kpiReviews.id] }).onDelete(
      "restrict",
    ),
    check("ai_generations_output", sql`(${t.status} = 'succeeded') = (${t.output} IS NOT NULL) AND (${t.status} = 'failed') = (${t.error} IS NOT NULL)`),
  ],
);

// Narasi ringkasan kinerja satu penilaian (feature 23) — satu baris per penilaian. generation_id = generasi AI terakhir yang
// diminta (hasilnya hanya dipasang jika masih yang terakhir). reviewed_at = sudah ditinjau manusia (syarat final jika ada
// narasi). Trigger kpi_review_summaries_guard_final menolak perubahan setelah penilaian final (narasi ada di snapshot).
export const kpiReviewSummaries = pgTable(
  "kpi_review_summaries",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    reviewId: uuid("review_id").notNull(),
    body: text("body"),
    source: kpiSummarySource("source"),
    generationId: uuid("generation_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedByName: text("reviewed_by_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Juga melayani filter tenant
    primaryKey({ name: "kpi_review_summaries_pkey", columns: [t.tenantId, t.reviewId] }),
    foreignKey({ name: "kpi_review_summaries_review_fk", columns: [t.tenantId, t.reviewId], foreignColumns: [kpiReviews.tenantId, kpiReviews.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      name: "kpi_review_summaries_generation_fk",
      columns: [t.tenantId, t.generationId],
      foreignColumns: [aiGenerations.tenantId, aiGenerations.id],
    }).onDelete("restrict"),
    check(
      "kpi_review_summaries_body",
      sql`(${t.body} IS NULL) = (${t.source} IS NULL) AND (${t.body} IS NULL OR char_length(${t.body}) BETWEEN 1 AND ${sql.raw(String(KPI_SUMMARY_MAX_LENGTH))})
        AND (${t.reviewedAt} IS NULL OR ${t.body} IS NOT NULL)`,
    ),
  ],
);

// ---- Data regulasi berlaku-tanggal (feature 24) — data referensi platform: tanpa tenant_id, baca-saja untuk app_user,
// diisi/diubah HANYA lewat migration (sumber resmi dicatat di kolom source). Versi: effective_from/effective_to inklusif
// (null = tanpa batas atas); exclusion constraint *_no_overlap (GiST, ditulis di migration) menolak versi beririsan.
// Tarif dalam persen numeric(7,4) ("3.7000" = 3,7%), uang numeric(18,2).

export const bpjsProgram = pgEnum("bpjs_program", BPJS_PROGRAMS);
export const taxRateKind = pgEnum("tax_rate_kind", TAX_RATE_KINDS);

// Tarif & batas upah BPJS. Satu baris = satu versi per program (JKK: per kelompok risiko 1–5).
export const bpjsRates = pgTable(
  "bpjs_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    program: bpjsProgram("program").notNull(),
    jkkRiskLevel: smallint("jkk_risk_level"),
    employerRatePercent: numeric("employer_rate_percent", { precision: 7, scale: 4 }).notNull(),
    employeeRatePercent: numeric("employee_rate_percent", { precision: 7, scale: 4 }).notNull(),
    // Batas atas upah dasar iuran per bulan; null = tanpa batas
    wageCap: numeric("wage_cap", { precision: 18, scale: 2 }),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    source: text("source").notNull(),
  },
  (t) => [
    check("bpjs_rates_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check("bpjs_rates_jkk_risk", sql`(${t.program} = 'jkk') = (${t.jkkRiskLevel} IS NOT NULL) AND coalesce(${t.jkkRiskLevel} BETWEEN 1 AND 5, true)`),
    check(
      "bpjs_rates_values",
      sql`${t.employerRatePercent} BETWEEN 0 AND 100 AND ${t.employeeRatePercent} BETWEEN 0 AND 100 AND coalesce(${t.wageCap} > 0, true)`,
    ),
  ],
);

// Versi tabel tarif pajak berlapis (TER A/B/C bulanan, Pasal 17 tahunan). Lapisnya di tax_rate_brackets.
export const taxRateTables = pgTable(
  "tax_rate_tables",
  {
    kind: taxRateKind("kind").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    source: text("source").notNull(),
  },
  (t) => [
    primaryKey({ name: "tax_rate_tables_pkey", columns: [t.kind, t.effectiveFrom] }),
    check("tax_rate_tables_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
  ],
);

// Lapis tarif: berlaku untuk penghasilan ≤ income_up_to (lapis sebelumnya < penghasilan). Lapis terakhir income_up_to null.
// seq = urutan lapis (1 = terendah); urutan income_up_to naik diperiksa test seed.
export const taxRateBrackets = pgTable(
  "tax_rate_brackets",
  {
    kind: taxRateKind("kind").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    seq: smallint("seq").notNull(),
    incomeUpTo: numeric("income_up_to", { precision: 18, scale: 2 }),
    ratePercent: numeric("rate_percent", { precision: 7, scale: 4 }).notNull(),
  },
  (t) => [
    primaryKey({ name: "tax_rate_brackets_pkey", columns: [t.kind, t.effectiveFrom, t.seq] }),
    foreignKey({
      name: "tax_rate_brackets_table_fk",
      columns: [t.kind, t.effectiveFrom],
      foreignColumns: [taxRateTables.kind, taxRateTables.effectiveFrom],
    }).onDelete("restrict"),
    check("tax_rate_brackets_values", sql`${t.seq} >= 1 AND coalesce(${t.incomeUpTo} > 0, true) AND ${t.ratePercent} BETWEEN 0 AND 100`),
  ],
);

// PTKP setahun per status + kategori TER-nya. Satu baris = satu versi per status.
export const ptkpRates = pgTable(
  "ptkp_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: ptkpStatus("status").notNull(),
    annualAmount: numeric("annual_amount", { precision: 18, scale: 2 }).notNull(),
    terKind: taxRateKind("ter_kind").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    source: text("source").notNull(),
  },
  (t) => [
    check("ptkp_rates_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check("ptkp_rates_values", sql`${t.annualAmount} > 0 AND ${t.terKind} <> 'pasal_17'`),
  ],
);

// Parameter PPh 21 lain (biaya jabatan). Satu baris = satu versi.
export const pph21Parameters = pgTable(
  "pph21_parameters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    occupationalCostRatePercent: numeric("occupational_cost_rate_percent", { precision: 7, scale: 4 }).notNull(),
    occupationalCostMonthlyMax: numeric("occupational_cost_monthly_max", { precision: 18, scale: 2 }).notNull(),
    occupationalCostAnnualMax: numeric("occupational_cost_annual_max", { precision: 18, scale: 2 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    source: text("source").notNull(),
  },
  (t) => [
    check("pph21_parameters_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check(
      "pph21_parameters_values",
      sql`${t.occupationalCostRatePercent} BETWEEN 0 AND 100 AND ${t.occupationalCostMonthlyMax} > 0 AND ${t.occupationalCostAnnualMax} > 0`,
    ),
  ],
);

// Upah minimum per bulan: UMK (regency_code) atau UMP (province_code) — tepat satu terisi.
// Lookup: UMK kota jika ada, selain itu UMP provinsinya.
export const minimumWages = pgTable(
  "minimum_wages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provinceCode: text("province_code").references(() => provinces.code, { onDelete: "restrict" }),
    regencyCode: text("regency_code").references(() => regencies.code, { onDelete: "restrict" }),
    monthlyAmount: numeric("monthly_amount", { precision: 18, scale: 2 }).notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    source: text("source").notNull(),
  },
  (t) => [
    check("minimum_wages_area", sql`num_nonnulls(${t.provinceCode}, ${t.regencyCode}) = 1`),
    check("minimum_wages_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check("minimum_wages_amount", sql`${t.monthlyAmount} > 0`),
  ],
);

// ——— Komponen gaji (feature 28) ———

export const payrollComponentKind = pgEnum("payroll_component_kind", PAYROLL_COMPONENT_KINDS);

// Katalog komponen gaji per usaha (/settings/salary-components). Jenis menentukan perlakuan di payroll-engine
// (BPJS, prorata, potongan absensi). Gaji pokok & tunjangan kehadiran masing-masing paling banyak satu yang aktif.
// Gaji pokok tidak bisa diarsipkan. Komponen yang sudah dipakai di gaji karyawan tidak bisa dihapus (FK RESTRICT) dan
// jenisnya tidak bisa diubah (dicek service) — cukup diarsipkan (tidak bisa dipilih untuk gaji baru).
export const salaryComponents = pgTable(
  "salary_components",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    kind: payrollComponentKind("kind").notNull(),
    sortOrder: smallint("sort_order").notNull(),
    // Kunci komponen bawaan (salary-builtin-components.ts) — null untuk komponen buatan usaha
    builtinKey: text("builtin_key"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("salary_components_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`),
    uniqueIndex("salary_components_tenant_builtin_key").on(t.tenantId, t.builtinKey).where(sql`${t.builtinKey} IS NOT NULL`),
    uniqueIndex("salary_components_tenant_single_kind_key")
      .on(t.tenantId, t.kind)
      .where(sql`${t.kind} IN ('base_salary', 'attendance_allowance') AND ${t.archivedAt} IS NULL`),
    unique("salary_components_tenant_id_id_key").on(t.tenantId, t.id),
    check("salary_components_base_not_archived", sql`${t.kind} <> 'base_salary' OR ${t.archivedAt} IS NULL`),
    check("salary_components_name", sql`length(btrim(${t.name})) BETWEEN 1 AND 80`),
  ],
);

// Gaji karyawan berlaku-tanggal: satu baris = satu versi (effective_from/effective_to inklusif; null = sampai diganti)
// berisi kepesertaan program BPJS; nilai komponen di employee_salary_items. Versi satu karyawan tidak beririsan
// (exclusion constraint di migration). Isi versi tidak bisa diubah — app_user hanya UPDATE effective_to (menutup versi)
// dan DELETE versi yang tergantikan versi baru (dicek service). effective_from ≥ tanggal masuk dicek service.
export const employeeSalaries = pgTable(
  "employee_salaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    employeeId: uuid("employee_id").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    // Kepesertaan program BPJS (kelompok risiko JKK di tenants.jkk_risk_level)
    bpjsKesehatan: boolean("bpjs_kesehatan").notNull(),
    bpjsJht: boolean("bpjs_jht").notNull(),
    bpjsJp: boolean("bpjs_jp").notNull(),
    bpjsJkk: boolean("bpjs_jkk").notNull(),
    bpjsJkm: boolean("bpjs_jkm").notNull(),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Snapshot nama pembuat — tetap terbaca bila akun dihapus
    createdByName: text("created_by_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("employee_salaries_tenant_employee_from_idx").on(t.tenantId, t.employeeId, t.effectiveFrom),
    unique("employee_salaries_tenant_id_id_key").on(t.tenantId, t.id),
    foreignKey({ name: "employee_salaries_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete(
      "restrict",
    ),
    check("employee_salaries_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check("employee_salaries_note", sql`${t.note} IS NULL OR length(${t.note}) <= 500`),
  ],
);

// Nilai satu komponen dalam satu versi gaji. Tepat satu gaji pokok per versi & tunjangan kehadiran paling banyak satu
// dicek service (jenis ada di salary_components).
export const employeeSalaryItems = pgTable(
  "employee_salary_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    salaryId: uuid("salary_id").notNull(),
    componentId: uuid("component_id").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("employee_salary_items_salary_component_key").on(t.tenantId, t.salaryId, t.componentId),
    index("employee_salary_items_tenant_component_idx").on(t.tenantId, t.componentId),
    foreignKey({
      name: "employee_salary_items_salary_fk",
      columns: [t.tenantId, t.salaryId],
      foreignColumns: [employeeSalaries.tenantId, employeeSalaries.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "employee_salary_items_component_fk",
      columns: [t.tenantId, t.componentId],
      foreignColumns: [salaryComponents.tenantId, salaryComponents.id],
    }).onDelete("restrict"),
    check("employee_salary_items_amount", sql`${t.amount} > 0`),
  ],
);

// ——— Run payroll (feature 29) ———

export const payrollRunStatus = pgEnum("payroll_run_status", PAYROLL_RUN_STATUSES);
export const payrollAdjustmentKind = pgEnum("payroll_adjustment_kind", PAYROLL_ADJUSTMENT_KINDS);

// Satu periode payroll = satu bulan kalender per usaha (period_month = tanggal 1). Angka draf dihitung saat dibaca dari
// gaji berlaku, absensi, aturan potongan, regulasi, dan penyesuaian (payroll_adjustments) — tidak disimpan. Finalisasi
// (feature 30) menyimpan snapshot periode di `snapshot` + per karyawan di payroll_run_employees; baris final dikunci
// trigger `payroll_runs_guard_final`. app_user SELECT/INSERT + UPDATE kolom finalisasi.
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    periodMonth: date("period_month", { mode: "string" }).notNull(),
    status: payrollRunStatus("status").notNull().default("draft"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // Snapshot nama pembuat — tetap terbaca bila akun dihapus
    createdByName: text("created_by_name"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedByUserId: uuid("finalized_by_user_id").references(() => users.id, { onDelete: "set null" }),
    finalizedByName: text("finalized_by_name"),
    // PayrollRunSnapshot (@exapay/shared) — divalidasi zod saat dibaca
    snapshot: jsonb("snapshot"),
    // Rentang absensi periode saat final (feature 30b, tutup buku); draf dihitung dari pengaturan usaha saat dibaca
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("payroll_runs_tenant_id_id_key").on(t.tenantId, t.id),
    // Satu periode per bulan per usaha; juga melayani filter tenant & urutan daftar
    unique("payroll_runs_tenant_month_key").on(t.tenantId, t.periodMonth),
    check("payroll_runs_period_month", sql`extract(day from ${t.periodMonth}) = 1`),
    check(
      "payroll_runs_final",
      sql`(${t.status} = 'final') = (${t.finalizedAt} IS NOT NULL AND ${t.snapshot} IS NOT NULL AND ${t.periodStart} IS NOT NULL AND ${t.periodEnd} IS NOT NULL)`,
    ),
    check("payroll_runs_period_range", sql`${t.periodEnd} IS NULL OR ${t.periodEnd} >= ${t.periodStart}`),
  ],
);

// Penyesuaian admin per karyawan di draf payroll (feature 29). Isian per jenis dijaga CHECK:
// add_line (line_kind + name + amount > 0) · override_component (component_id + amount ≥ 0 + reason) ·
// waive_attendance / exclude (reason). Satu override per komponen, satu waive/exclude per karyawan per periode.
export const payrollAdjustments = pgTable(
  "payroll_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    runId: uuid("run_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    kind: payrollAdjustmentKind("kind").notNull(),
    // add_line: variable_allowance | deduction
    lineKind: payrollComponentKind("line_kind"),
    name: text("name"),
    componentId: uuid("component_id"),
    amount: numeric("amount", { precision: 18, scale: 2 }),
    reason: text("reason"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByName: text("created_by_name"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Juga melayani filter tenant & daftar per periode/karyawan
    index("payroll_adjustments_tenant_run_employee_idx").on(t.tenantId, t.runId, t.employeeId),
    index("payroll_adjustments_tenant_employee_idx").on(t.tenantId, t.employeeId),
    index("payroll_adjustments_tenant_component_idx").on(t.tenantId, t.componentId),
    uniqueIndex("payroll_adjustments_single_key")
      .on(t.tenantId, t.runId, t.employeeId, t.kind)
      .where(sql`${t.kind} IN ('waive_attendance', 'exclude')`),
    uniqueIndex("payroll_adjustments_override_key")
      .on(t.tenantId, t.runId, t.employeeId, t.componentId)
      .where(sql`${t.kind} = 'override_component'`),
    foreignKey({ name: "payroll_adjustments_run_fk", columns: [t.tenantId, t.runId], foreignColumns: [payrollRuns.tenantId, payrollRuns.id] }).onDelete(
      "restrict",
    ),
    foreignKey({ name: "payroll_adjustments_employee_fk", columns: [t.tenantId, t.employeeId], foreignColumns: [employees.tenantId, employees.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      name: "payroll_adjustments_component_fk",
      columns: [t.tenantId, t.componentId],
      foreignColumns: [salaryComponents.tenantId, salaryComponents.id],
    }).onDelete("restrict"),
    check(
      "payroll_adjustments_fields",
      sql`CASE ${t.kind}
        WHEN 'add_line' THEN ${t.lineKind} IN ('variable_allowance', 'deduction') AND ${t.name} IS NOT NULL AND ${t.amount} > 0
          AND ${t.componentId} IS NULL AND ${t.reason} IS NULL
        WHEN 'override_component' THEN ${t.componentId} IS NOT NULL AND ${t.amount} >= 0 AND ${t.reason} IS NOT NULL
          AND ${t.lineKind} IS NULL AND ${t.name} IS NULL
        ELSE ${t.reason} IS NOT NULL AND ${t.lineKind} IS NULL AND ${t.name} IS NULL AND ${t.componentId} IS NULL AND ${t.amount} IS NULL
      END`,
    ),
    check("payroll_adjustments_name", sql`${t.name} IS NULL OR length(btrim(${t.name})) BETWEEN 1 AND 80`),
    check("payroll_adjustments_reason", sql`${t.reason} IS NULL OR length(btrim(${t.reason})) BETWEEN 1 AND 500`),
  ],
);

// Snapshot final per karyawan per periode (feature 30) — immutable: app_user SELECT/INSERT saja, trigger menolak
// UPDATE/DELETE dan INSERT ke periode yang sudah final. Hanya karyawan dihitung & dikeluarkan (gaji belum diatur /
// gagal hitung memblokir finalisasi). Kolom uang = ringkasan untuk slip, laporan, dan masa PPh 21 sebelumnya.
export const payrollRunEmployees = pgTable(
  "payroll_run_employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    runId: uuid("run_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    status: text("status", { enum: ["calculated", "excluded"] }).notNull(),
    // Snapshot identitas saat final
    fullName: text("full_name").notNull(),
    employeeNumber: text("employee_number"),
    grossPay: numeric("gross_pay", { precision: 18, scale: 2 }),
    totalDeductions: numeric("total_deductions", { precision: 18, scale: 2 }),
    bpjsEmployer: numeric("bpjs_employer", { precision: 18, scale: 2 }),
    bpjsEmployee: numeric("bpjs_employee", { precision: 18, scale: 2 }),
    // Bisa negatif (kelebihan potong dikembalikan di masa pajak terakhir)
    pph21: numeric("pph21", { precision: 18, scale: 2 }),
    takeHomePay: numeric("take_home_pay", { precision: 18, scale: 2 }),
    // Pph21PeriodRecord untuk masa pajak terakhir tahun yang sama
    pph21GrossIncome: numeric("pph21_gross_income", { precision: 18, scale: 2 }),
    pensionContribution: numeric("pension_contribution", { precision: 18, scale: 2 }),
    // PayrollEmployeeSnapshot (@exapay/shared) — divalidasi zod saat dibaca
    snapshot: jsonb("snapshot").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("payroll_run_employees_tenant_id_id_key").on(t.tenantId, t.id),
    // Juga melayani filter tenant & daftar per periode
    unique("payroll_run_employees_run_employee_key").on(t.tenantId, t.runId, t.employeeId),
    index("payroll_run_employees_tenant_employee_idx").on(t.tenantId, t.employeeId),
    foreignKey({ name: "payroll_run_employees_run_fk", columns: [t.tenantId, t.runId], foreignColumns: [payrollRuns.tenantId, payrollRuns.id] }).onDelete(
      "restrict",
    ),
    foreignKey({
      name: "payroll_run_employees_employee_fk",
      columns: [t.tenantId, t.employeeId],
      foreignColumns: [employees.tenantId, employees.id],
    }).onDelete("restrict"),
    check("payroll_run_employees_status", sql`${t.status} IN ('calculated', 'excluded')`),
    check(
      "payroll_run_employees_amounts",
      sql`(${t.status} = 'calculated') = (${t.grossPay} IS NOT NULL AND ${t.totalDeductions} IS NOT NULL AND ${t.bpjsEmployer} IS NOT NULL
        AND ${t.bpjsEmployee} IS NOT NULL AND ${t.pph21} IS NOT NULL AND ${t.takeHomePay} IS NOT NULL
        AND ${t.pph21GrossIncome} IS NOT NULL AND ${t.pensionContribution} IS NOT NULL)`,
    ),
  ],
);

export const payslipStatus = pgEnum("payslip_status", PAYSLIP_STATUSES);
export const payslipEmailStatus = pgEnum("payslip_email_status", PAYSLIP_EMAIL_STATUSES);

// Slip gaji PDF (feature 31): satu per karyawan yang DIHITUNG di periode final (FK ke snapshot payroll_run_employees).
// Dibuat finalisasi (pending) di transaksi yang sama → worker membuat PDF dari snapshot ke storage (generating →
// ready/failed). published_at = diterbitkan owner/admin (baru terlihat di portal karyawan); email_* = pemberitahuan
// berisi tautan (tujuan di-snapshot saat diminta). Slip siap tidak bisa dibuat ulang/diganti, terbit tidak bisa dibatalkan
// (trigger). Tanpa DELETE.
export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    runId: uuid("run_id").notNull(),
    employeeId: uuid("employee_id").notNull(),
    status: payslipStatus("status").notNull().default("pending"),
    attempts: smallint("attempts").notNull().default(0),
    // Key storage tenants/<tenant_id>/payslips/<run_id>/<id>.pdf
    fileKey: text("file_key"),
    fileSize: integer("file_size"),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    // Pesan aman untuk pengguna (detail teknis hanya di log worker)
    error: text("error"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedByUserId: uuid("published_by_user_id").references(() => users.id, { onDelete: "set null" }),
    publishedByName: text("published_by_name"),
    emailStatus: payslipEmailStatus("email_status"),
    emailTo: text("email_to"),
    emailRequestedAt: timestamp("email_requested_at", { withTimezone: true }),
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    emailError: text("email_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("payslips_tenant_id_id_key").on(t.tenantId, t.id),
    // Juga melayani filter tenant & daftar per periode
    unique("payslips_run_employee_key").on(t.tenantId, t.runId, t.employeeId),
    // Portal karyawan: slip milik sendiri
    index("payslips_tenant_employee_idx").on(t.tenantId, t.employeeId),
    foreignKey({
      name: "payslips_run_employee_fk",
      columns: [t.tenantId, t.runId, t.employeeId],
      foreignColumns: [payrollRunEmployees.tenantId, payrollRunEmployees.runId, payrollRunEmployees.employeeId],
    }).onDelete("restrict"),
    check("payslips_file", sql`(${t.status} = 'ready') = (${t.fileKey} IS NOT NULL AND ${t.fileSize} IS NOT NULL AND ${t.generatedAt} IS NOT NULL)`),
    check("payslips_published", sql`${t.publishedAt} IS NULL OR ${t.status} = 'ready'`),
    check(
      "payslips_email",
      sql`(${t.emailStatus} IS NULL) = (${t.emailTo} IS NULL AND ${t.emailRequestedAt} IS NULL) AND (${t.emailStatus} IS NULL OR ${t.publishedAt} IS NOT NULL)`,
    ),
  ],
);

// ——— Kalender kepatuhan (feature 33) ———

export const complianceDeadlineKind = pgEnum("compliance_deadline_kind", COMPLIANCE_DEADLINE_KINDS);
export const complianceReminderKind = pgEnum("compliance_reminder_kind", COMPLIANCE_REMINDER_KINDS);

// Data regulasi platform (pola feature 24): tenggat setor/lapor per masa. Masa M → tanggal due_day pada bulan
// M + month_offset (bulan pendek → hari terakhir). Versi berlaku menurut tanggal 1 masa (effective_from/to inklusif,
// exclusion compliance_deadlines_no_overlap). Diisi/diubah hanya lewat migration.
export const complianceDeadlines = pgTable(
  "compliance_deadlines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: complianceDeadlineKind("kind").notNull(),
    dueDay: smallint("due_day").notNull(),
    monthOffset: smallint("month_offset").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    source: text("source").notNull(),
  },
  (t) => [
    check("compliance_deadlines_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check("compliance_deadlines_values", sql`${t.dueDay} BETWEEN 1 AND 31 AND ${t.monthOffset} BETWEEN 0 AND 2`),
  ],
);

// Status pengingat kepatuhan per usaha. Pengingat sendiri dihitung saat dibaca (@exapay/shared complianceRemindersBetween);
// baris dibuat saat pengingat ditandai selesai atau email H-7/H-1 terkirim. key = kunci pengingat (jenis + masa / karyawan
// + tanggal) — tanggal kontrak berubah → kunci baru. Tanpa DELETE.
export const complianceReminders = pgTable(
  "compliance_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    kind: complianceReminderKind("kind").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneByUserId: uuid("done_by_user_id").references(() => users.id, { onDelete: "set null" }),
    doneByName: text("done_by_name"),
    notifiedH7At: timestamp("notified_h7_at", { withTimezone: true }),
    notifiedH1At: timestamp("notified_h1_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("compliance_reminders_tenant_key").on(t.tenantId, t.key),
    index("compliance_reminders_tenant_due_idx").on(t.tenantId, t.dueDate),
    check("compliance_reminders_done", sql`(${t.doneAt} IS NULL) = (${t.doneByName} IS NULL)`),
    check("compliance_reminders_key_kind", sql`split_part(${t.key}, ':', 1) = ${t.kind}::text`),
  ],
);

// ——— Langganan & trial (Phase 9, feature 39) ———

export const subscriptionStatus = pgEnum("subscription_status", SUBSCRIPTION_STATUSES);

// Harga platform berlaku-tanggal (pola data regulasi feature 24, tanpa tenant_id): harga per karyawan aktif per bulan,
// minimum karyawan ditagih, lama trial & masa tenggang. Versi tidak beririsan (exclusion billing_prices_no_overlap).
// Nilai awal di migration 0030; diubah super-admin mulai feature 42 (versi baru, bukan menimpa). Tagihan menyimpan snapshot.
export const billingPrices = pgTable(
  "billing_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pricePerEmployee: numeric("price_per_employee", { precision: 18, scale: 2 }).notNull(),
    minBilledEmployees: smallint("min_billed_employees").notNull(),
    trialDays: smallint("trial_days").notNull(),
    graceDays: smallint("grace_days").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    effectiveTo: date("effective_to", { mode: "string" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    check("billing_prices_date_order", sql`${t.effectiveTo} IS NULL OR ${t.effectiveTo} >= ${t.effectiveFrom}`),
    check(
      "billing_prices_values",
      sql`${t.pricePerEmployee} >= 0 AND ${t.minBilledEmployees} >= 0 AND ${t.trialDays} BETWEEN 0 AND 365 AND ${t.graceDays} BETWEEN 0 AND 90`,
    ),
  ],
);

// Satu baris per tenant. Status efektif (past_due/read_only) dihitung dari tanggal saat dibaca — lihat
// subscriptionStateAt di @exapay/shared (billing.ts). Hanya super-admin/app_owner yang boleh membuat selain
// trial (trigger guard_tenant_subscription); app_user tanpa UPDATE/DELETE sampai feature 41/42.
export const tenantSubscriptions = pgTable(
  "tenant_subscriptions",
  {
    tenantId: uuid("tenant_id")
      .primaryKey()
      .references(() => tenants.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
    // Harga khusus usaha ini (feature 42, diatur super-admin) — null = ikut harga platform berlaku. Dipakai tagihan
    // yang terbit setelah diubah; tagihan lama menyimpan snapshot.
    pricePerEmployeeOverride: numeric("price_per_employee_override", { precision: 18, scale: 2 }),
    minBilledEmployeesOverride: smallint("min_billed_employees_override"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      "tenant_subscriptions_overrides",
      sql`(${t.pricePerEmployeeOverride} IS NULL OR ${t.pricePerEmployeeOverride} >= 0) AND (${t.minBilledEmployeesOverride} IS NULL OR ${t.minBilledEmployeesOverride} >= 0)`,
    ),
    check(
      "tenant_subscriptions_dates",
      sql`(${t.status} <> 'trialing' OR ${t.trialEndsAt} IS NOT NULL) AND (${t.status} <> 'active' OR ${t.currentPeriodEndsAt} IS NOT NULL)`,
    ),
  ],
);

export const subscriptionNoticeKind = pgEnum("subscription_notice_kind", SUBSCRIPTION_NOTICE_KINDS);

// Email pengingat langganan yang sudah dikirim worker (feature 40) — satu baris per (usaha, jenis, akhir trial/periode)
// agar tidak terkirim dua kali; perpanjangan trial/periode = period_ends_at baru = pengingat baru. Append-only.
export const subscriptionNotices = pgTable(
  "subscription_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    kind: subscriptionNoticeKind("kind").notNull(),
    periodEndsAt: timestamp("period_ends_at", { withTimezone: true }).notNull(),
    recipientCount: smallint("recipient_count").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("subscription_notices_once").on(t.tenantId, t.kind, t.periodEndsAt)],
);

export const billingInvoiceStatus = pgEnum("billing_invoice_status", BILLING_INVOICE_STATUSES);

// Tagihan langganan (feature 41) — diterbitkan worker H-7 sebelum trial/periode berakhir (atau saat sudah lewat), satu
// tagihan berjalan (open/awaiting_confirmation) per usaha. Rincian = snapshot saat terbit (harga, minimum, jumlah karyawan
// aktif); konsistensi nominal dijaga CHECK. Nominal total unik di antara tagihan berjalan SELURUH platform (index unik
// parsial — pemeriksaan index tidak melewati RLS) agar pembayaran QRIS bisa dicocokkan dari mutasi merchant.
// app_user: SELECT, INSERT, UPDATE kolom klaim/status saja; transisi dijaga trigger guard_billing_invoice (lunas = super-admin).
export const billingInvoices = pgTable(
  "billing_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    // Nomor tagihan yang tampil ke owner & super-admin, unik seluruh platform
    number: text("number").notNull(),
    status: billingInvoiceStatus("status").notNull().default("open"),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    pricePerEmployee: numeric("price_per_employee", { precision: 18, scale: 2 }).notNull(),
    minBilledEmployees: smallint("min_billed_employees").notNull(),
    activeEmployees: integer("active_employees").notNull(),
    billedEmployees: integer("billed_employees").notNull(),
    baseAmount: numeric("base_amount", { precision: 18, scale: 2 }).notNull(),
    uniqueCode: smallint("unique_code").notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
    // Implementasi PaymentProvider yang dipakai (feature 41: QRIS statik → dinamis, konfirmasi manual super-admin)
    paymentMethod: text("payment_method").notNull().default("qris-manual"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    claimedByUserId: uuid("claimed_by_user_id"),
    // Bukti bayar opsional di storage S3 (key diawali tenant_id); hanya metadata di sini
    proofKey: text("proof_key"),
    proofName: text("proof_name"),
    proofType: text("proof_type", { enum: LEAVE_ATTACHMENT_TYPES }),
    proofSize: integer("proof_size"),
    // Keputusan pemilik platform (feature 42): lunas, atau laporan bayar ditolak (tagihan kembali open + alasan)
    paidAt: timestamp("paid_at", { withTimezone: true }),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    decisionSource: text("decision_source", { enum: BILLING_DECISION_SOURCES }),
    rejectionReason: text("rejection_reason"),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("billing_invoices_number_key").on(t.number),
    unique("billing_invoices_tenant_id_key").on(t.tenantId, t.id),
    index("billing_invoices_tenant_issued_idx").on(t.tenantId, t.issuedAt),
    uniqueIndex("billing_invoices_live_tenant_key").on(t.tenantId).where(sql`${t.status} IN ('open', 'awaiting_confirmation')`),
    uniqueIndex("billing_invoices_live_amount_key").on(t.totalAmount).where(sql`${t.status} IN ('open', 'awaiting_confirmation')`),
    // Akun pengklaim dicabut → kolom user dikosongkan (migration: ON DELETE SET NULL (claimed_by_user_id) — tenant_id tetap)
    foreignKey({ name: "billing_invoices_claimed_by_fk", columns: [t.tenantId, t.claimedByUserId], foreignColumns: [memberships.tenantId, memberships.userId] }).onDelete(
      "set null",
    ),
    check(
      "billing_invoices_amounts",
      sql`${t.pricePerEmployee} >= 0 AND ${t.minBilledEmployees} >= 0 AND ${t.activeEmployees} >= 0 AND ${t.billedEmployees} = GREATEST(${t.activeEmployees}, ${t.minBilledEmployees}) AND ${t.baseAmount} = ${t.pricePerEmployee} * ${t.billedEmployees} AND ${t.uniqueCode} BETWEEN 1 AND 999 AND ${t.totalAmount} = ${t.baseAmount} + ${t.uniqueCode}`,
    ),
    check("billing_invoices_due_after_issue", sql`${t.dueAt} > ${t.issuedAt}`),
    check("billing_invoices_claim", sql`${t.status} <> 'awaiting_confirmation' OR ${t.claimedAt} IS NOT NULL`),
    check("billing_invoices_paid", sql`(${t.status} = 'paid') = (${t.paidAt} IS NOT NULL)`),
    check("billing_invoices_rejection", sql`(${t.rejectionReason} IS NULL) = (${t.rejectedAt} IS NULL)`),
    check(
      "billing_invoices_proof",
      sql`(${t.proofKey} IS NULL) = (${t.proofName} IS NULL) AND (${t.proofKey} IS NULL) = (${t.proofType} IS NULL) AND (${t.proofKey} IS NULL) = (${t.proofSize} IS NULL) AND (${t.proofKey} IS NULL OR ${t.claimedAt} IS NOT NULL)`,
    ),
  ],
);

// Tautan konfirmasi/tolak pembayaran di email pemberitahuan klaim (feature 42) — hanya hash SHA-256 token yang disimpan.
// Sekali pakai, kedaluwarsa, terikat ke klaim tertentu (claimed_at): laporan ulang setelah ditolak = token baru.
// Dibaca/dipakai tanpa login lewat fungsi SECURITY DEFINER billing_find_confirmation / billing_consume_confirmation;
// token yang dipakai di transaksi ini (used_txid) membuka izin ubah tagihan & langganan di trigger guard (feature 42).
export const billingConfirmationTokens = pgTable(
  "billing_confirmation_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedTxid: bigint("used_txid", { mode: "number" }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("billing_confirmation_tokens_hash_key").on(t.tokenHash),
    index("billing_confirmation_tokens_tenant_invoice_idx").on(t.tenantId, t.invoiceId),
    foreignKey({
      name: "billing_confirmation_tokens_invoice_fk",
      columns: [t.tenantId, t.invoiceId],
      foreignColumns: [billingInvoices.tenantId, billingInvoices.id],
    }).onDelete("cascade"),
    check("billing_confirmation_tokens_used", sql`(${t.usedAt} IS NULL) = (${t.usedTxid} IS NULL)`),
  ],
);
