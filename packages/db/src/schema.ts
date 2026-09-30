import { MEMBERSHIP_ROLES } from "@exapay/shared";
import { sql } from "drizzle-orm";
import { boolean, check, index, jsonb, pgEnum, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
  (t) => [uniqueIndex("departments_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`)],
);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("positions_tenant_name_key").on(t.tenantId, sql`lower(${t.name})`)],
);
