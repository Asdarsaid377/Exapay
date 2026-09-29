# Database Standards — PostgreSQL + NestJS

Semua aturan database, auth, multi-tenancy, antrean, dan penyimpanan file untuk project ini. Database adalah PostgreSQL biasa (Docker), diakses **hanya** oleh `apps/api` dan `apps/worker`.

> ORM: **Drizzle** (drizzle-kit untuk migration). Contoh di bawah ditulis dalam SQL murni; pola kode Drizzle dicatat di bagian "Pola ORM" saat feature 02 dikerjakan (verifikasi API Drizzle terbaru, jangan dari ingatan).

---

## Environment Variables

```bash
# .env — JANGAN pernah di-commit
DATABASE_URL=postgres://app_user:...@postgres:5432/exapayroll        # role aplikasi, BUKAN owner tabel
DATABASE_MIGRATION_URL=postgres://app_owner:...@postgres:5432/exapayroll  # hanya untuk migration
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
DATA_ENCRYPTION_KEY=...        # kunci enkripsi kolom sensitif (NIK, NPWP, rekening)
```

- Secret tidak pernah muncul di `apps/web` dan tidak pernah diberi prefix `NEXT_PUBLIC_`
- `.env.example` berisi nama variabel tanpa value — selalu update saat ada env baru

---

## Dua Role Postgres

| Role | Dipakai oleh | Hak |
| --- | --- | --- |
| `app_owner` | Migration | Owner semua tabel, DDL |
| `app_user` | API & worker saat runtime | DML saja, **bukan owner** → RLS berlaku |

Operasi yang memang harus lintas tenant (mis. job kalender kepatuhan untuk semua tenant) memakai role/fungsi khusus yang terdokumentasi, dengan komentar alasan di kode. Tidak ada bypass RLS diam-diam.

---

## Multi-Tenancy & Row Level Security — WAJIB

Setiap tabel bisnis:

```sql
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  -- kolom lain
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.employees (tenant_id);

alter table public.employees enable row level security;
alter table public.employees force row level security;

create policy tenant_isolation on public.employees
  using (tenant_id = current_setting('app.tenant_id', true)::uuid)
  with check (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

Di API, setiap request yang menyentuh data tenant:

```sql
begin;
select set_config('app.tenant_id', '<tenant uuid dari sesi>', true);  -- true = hanya transaksi ini
-- query...
commit;
```

Aturan:

- Tenant diambil dari **sesi user yang sudah diverifikasi**, tidak pernah dari body/query param request
- `set_config` wajib dalam transaksi yang sama dengan query (aman terhadap connection pool)
- Setiap tabel baru wajib punya test isolasi: data tenant A tidak terbaca dari konteks tenant B
- Fitur RLS dibangun dan diuji **paling awal**, sebelum tabel bisnis lain

---

## Auth & RBAC

- Auth dibangun di NestJS (`modules/auth`): password di-hash dengan argon2 (atau bcrypt), JWT access token berumur pendek + refresh token
- Web: token disimpan di **cookie httpOnly, Secure, SameSite=Lax** — tidak di localStorage
- Guard juga menerima `Authorization: Bearer` agar aplikasi mobile native (fase berikutnya) bisa memakai API yang sama
- Super-admin adalah flag platform di `users`, bukan role tenant; tidak punya akses ke data gaji/karyawan tenant
- Tabel `memberships (user_id, tenant_id, role)` — satu user bisa di lebih dari satu tenant
- Role: `owner`, `admin`, `atasan`, `karyawan` — didefinisikan sebagai enum di `packages/shared`
- Otorisasi di API lewat `RolesGuard` + dekorator `@Roles(...)`; aturan "atasan hanya melihat bawahannya" dicek di service
- Reset password & undangan: diputuskan di feature 04/08

**Mekanisme (feature 03):**

- Password: argon2id (`@node-rs/argon2`, parameter default = rekomendasi OWASP). Email tidak terdaftar tetap menjalankan verify dummy (waktu respons tidak membocorkan akun)
- Access token: JWT HS256 15 menit, klaim `{ sub, tid, role, sa }`, secret `JWT_ACCESS_SECRET`
- Refresh token: JWT HS256 30 hari `{ sub, jti, fam }` (secret `JWT_REFRESH_SECRET`); `jti` = baris `refresh_tokens` (status pencabutan + tenant aktif). **Rotasi** tiap refresh; token lama dipakai ulang > 30 detik setelah dirotasi → seluruh family dicabut (indikasi pencurian); ≤ 30 detik → hanya ditolak (request paralel)
- Web: cookie `exapay_access` & `exapay_refresh` (httpOnly, SameSite=Lax, Secure di production, path `/`). Mobile: kirim `client: "mobile"` → token di body, dipakai sebagai `Authorization: Bearer`; refresh token dikirim di body
- Endpoint: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/switch-tenant`, `POST /auth/logout` (publik — tetap jalan walau access token kedaluwarsa), `GET /auth/me`
- Tenant aktif: otomatis jika user hanya punya 1 membership; selain itu pilih lewat `switch-tenant` (rotasi refresh token dengan tenant baru). Peran di access token bisa basi maksimal 15 menit — refresh membaca ulang membership
- Login tanpa konteks memakai fungsi `auth_find_user_by_email()` (SECURITY DEFINER milik `app_owner`); policy `definer_select` di `users` hanya berlaku untuk `current_user = 'app_owner'`
- `is_super_admin` hanya bisa diubah `app_owner` (trigger `guard_super_admin_flag`)

---

## Uang & Regulasi

- Kolom uang: `numeric(18,2)` (atau presisi lebih jika perlu untuk perhitungan antara). **Tidak pernah** `float`/`real`/`double precision`
- Di kode: `decimal.js`. Konversi dari/ke DB lewat string, tidak lewat `number`
- Aturan regulasi (tabel TER PPh 21, batas upah BPJS, tarif, UMK) disimpan sebagai data dengan `effective_from date not null` dan `effective_to date null` — tidak di-hardcode di kode
- Pembulatan mengikuti aturan resmi yang berlaku dan dicatat eksplisit di `payroll-engine`

---

## Snapshot, Audit, Data Sensitif

- Payroll yang difinalisasi: simpan snapshot (input + hasil perhitungan + versi aturan yang dipakai) sebagai data immutable. Koreksi = periode/adjustment baru, bukan update baris lama
- Tabel `audit_logs (tenant_id, actor_user_id, entity, entity_id, action, before, after, created_at)` — diisi untuk semua mutasi data sensitif (gaji, data karyawan, status KPI)
- NIK, NPWP, nomor rekening: dienkripsi di level aplikasi (AES-256-GCM, kunci dari `DATA_ENCRYPTION_KEY`) sebelum disimpan. Tampilkan termasking di UI kecuali user berhak

---

## Perubahan Schema — Hanya Lewat Migration

- Semua perubahan schema lewat file migration di `packages/db/migrations/` (drizzle-kit; RLS policy & trigger ditulis sebagai SQL custom migration)
- Satu migration = satu perubahan logis
- Migration yang pernah di-apply ke environment manapun **tidak boleh diedit** — buat migration baru
- Setiap tabel baru dalam migration yang sama: `tenant_id` + index + RLS enable + force + policy + trigger `updated_at`
- Timestamp standar: `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`
- Dilarang reset/drop database non-lokal tanpa konfirmasi eksplisit user. Dilarang SQL manual ke production

---

## Antrean (BullMQ + Redis)

- Pekerjaan lambat/eksternal selalu lewat antrean: PDF slip gaji, ringkasan AI, WhatsApp, sync ERPNext
- Job harus **idempotent** (aman dijalankan ulang) dan membawa `tenant_id` di payload; worker juga wajib `set_config` tenant sebelum query
- Retry dengan backoff; kegagalan dicatat, tidak meruntuhkan proses lain
- Redis bukan sumber kebenaran — status penting disimpan di Postgres

---

## Penyimpanan File

- Slip gaji PDF, foto bukti tugas, lampiran izin, file impor: server **S3-compatible self-hosted** di VPS (**SeaweedFS**), diakses lewat API S3 agar bisa pindah provider tanpa ubah kode
- File privat; diakses lewat endpoint API yang mengecek hak akses atau signed URL berumur pendek
- Path file mengandung `tenant_id` agar mudah diisolasi dan di-backup

---

## Query Patterns

- Select kolom eksplisit, hindari `select *`
- Semua error DB ditangkap di service, di-log dengan prefix `[modul/aksi]`, dikembalikan ke client sebagai pesan human-readable
- Operasi multi-langkah (finalisasi payroll) dalam **satu transaksi**

## Pola ORM

Drizzle `0.45` + drizzle-kit `0.31`. Schema: `packages/db/src/schema.ts` (satu file — drizzle-kit memuat file TS langsung). Migration: `packages/db/migrations/`.

**Transaksi ber-tenant** (`apps/api/src/database/tenant-transaction.ts`):

```typescript
// Inject db: @Inject(DRIZZLE) private readonly db: Database
const rows = await withTenant(this.db, ctx, async (tx) => {
  const result = await tx.select({ id: employees.id }).from(employees);
  await this.audit.record(tx, ctx, { entity: "employee", entityId: id, action: "update", before, after });
  return result;
});
```

- `withTenant` membuka transaksi lalu `set_config('app.tenant_id' / 'app.user_id', ..., true)`. `ctx: TenantContext = { tenantId, userId | null }` berasal dari sesi terverifikasi
- Policy memakai fungsi `current_app_tenant_id()` / `current_app_user_id()` (bukan `current_setting(...)::uuid` langsung): setting kembali menjadi `''` — bukan NULL — di koneksi pool setelah transaksi selesai, dan `''::uuid` error
- Query di luar `withTenant` tidak melihat baris apapun (by design)
- Audit log: `AuditService.record(tx, ctx, entry)` di transaksi yang sama dengan mutasinya → ikut rollback. `audit_logs` append-only (app_user hanya SELECT + INSERT)

**Membuat migration:**

1. Ubah `packages/db/src/schema.ts` → `pnpm --filter @exapay/db db:generate --name=<nama>`
2. **Sebelum apply**, tambahkan ke file SQL yang sama (dipisah `--> statement-breakpoint`): `ENABLE` + `FORCE ROW LEVEL SECURITY`, policy `tenant_isolation` (pakai `public.current_app_tenant_id()`), trigger `<tabel>_set_updated_at` (`EXECUTE FUNCTION public.set_updated_at()`), dan `GRANT ... TO app_user` per tabel
3. Tidak ada `ALTER DEFAULT PRIVILEGES` — tabel tanpa grant eksplisit gagal keras (lebih aman daripada tabel tanpa RLS yang bocor diam-diam)
4. Migration khusus SQL (fungsi, data): `pnpm --filter @exapay/db exec drizzle-kit generate --custom --name=<nama>`
5. Apply: `pnpm --filter @exapay/db db:migrate` (memakai `DATABASE_MIGRATION_URL`, role `app_owner`; tabel riwayat `drizzle.__drizzle_migrations`)
6. Tambah test isolasi di `apps/api/test/` untuk tabel baru. Test "semua tabel public RLS + FORCE" otomatis gagal jika ada tabel tanpa RLS — update daftar tabelnya

**Test integrasi:** `pnpm --filter @exapay/api test` (butuh container postgres jalan). Global setup membuat database terpisah `exapayroll_test` (drop/create — hanya DB itu), menjalankan migration sebagai `app_owner`, test berjalan sebagai `app_user`, lalu DB test di-drop.
