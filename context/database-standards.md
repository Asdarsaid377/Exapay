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
- **Undangan (fondasi feature 07):** tabel `invitations` (tenant biasa, RLS `tenant_isolation`) — email, nama, peran, hash SHA-256 token, berlaku 7 hari, hanya undangan terbaru per (tenant, email) yang berlaku. Lookup tanpa konteks lewat `auth_find_invitation()` (SECURITY DEFINER). `POST /invitations/lookup` & `/invitations/accept` (publik, token di body): email baru → akun dibuat terverifikasi (token = bukti kepemilikan email); email terdaftar → cukup membership baru, password lama tetap. Membership yang sudah ada tidak diubah perannya. Sesi tidak dibuat. `InvitationsService.create(tx, ctx, …)` dipakai ulang feature 08
- **Karyawan (feature 11):** tabel `employees` (migration `0009`) — tanpa hard delete (app_user tanpa DELETE; nonaktif = `end_date`). Atasan (peran) melihat karyawan yang `supervisor_id` = data karyawan miliknya (`employees.user_id` = user); di luar cakupan → 404. Peran dibaca ulang dari `memberships` tiap transaksi. Siklus atasan dicegah di service (recursive CTE). Departemen/jabatan yang masih dipakai tidak bisa dihapus (409)
- **Absensi (feature 14):** `attendance_records` — satu baris per karyawan per tanggal kerja lokal, tanpa DELETE. Jam dari server, zona waktu dari `provinces.time_zone` usaha (fallback WIB). Jadwal & menit telat di-snapshot saat absen masuk. Akses absen = akun tertaut data karyawan aktif (semua peran)
- **Pengajuan izin/sakit/cuti (feature 15):** `leave_requests` — rentang hari penuh, tanpa DELETE (batal = status `cancelled`). Exclusion constraint `leave_requests_no_overlap` (GiST, extension `btree_gist`) menolak rentang beririsan untuk pengajuan menunggu/disetujui satu karyawan → 409. Pemutus: atasan langsung (peran atasan, `supervisor_id`) atau owner/admin; tidak ada yang memutuskan pengajuan miliknya sendiri (403). Nama pemutus di-snapshot (`decided_by_name`). Keputusan tercatat di audit log (`leave_request` approve/reject); pengajuan & pembatalan oleh karyawan tanpa audit (baris = catatannya). Hari kerja pengajuan dihitung saat dibaca dari `WorkCalendarService`
- **Rekap & koreksi absensi (feature 16):** rekap dihitung saat dibaca (tanpa tabel rekap) dari `attendance_records` + `leave_requests` disetujui + kalender kerja. Koreksi owner/admin: `attendance_corrections` (append-only, app_user SELECT/INSERT; FK komposit ke `attendance_records` lewat unique `(tenant_id, id)`) + audit `attendance_record`/`correct`; baris absensi dikunci `SELECT … FOR UPDATE`; hari tanpa absen → baris dibuat (jadwal snapshot dari jadwal saat ini). Tidak ada yang mengoreksi absensinya sendiri (403). Cakupan penglihat (owner/admin semua, atasan bawahan langsung) di `attendance-viewer.ts`
- **Aturan potongan absensi (feature 17):** `attendance_deduction_rules` — satu baris = satu versi per usaha (`effective_from`/`effective_to` inklusif), aturan per kolom + CHECK per mode, uang `numeric(18,2)`, exclusion constraint `attendance_deduction_rules_no_overlap`. app_user UPDATE **hanya `effective_to`** (isi versi immutable); DELETE hanya dipakai service untuk versi terjadwal yang tergantikan (tanggal berlaku ≥ hari ini). Simpan mengunci versi `FOR UPDATE`; audit `attendance_deduction_rule` create/close/delete. Perhitungan di `payroll-engine` (`calculateAttendanceDeduction`)
- **Kelola pengguna (feature 08):** modul `users` — wewenang dari `MANAGEABLE_ROLES` (`@exapay/shared`): owner → semua peran, admin → atasan & karyawan; tidak mengubah/mencabut diri sendiri; minimal satu owner per usaha. Peran pengelola dibaca ulang dari `memberships` di transaksi (bukan klaim JWT). Cabut akses = hapus membership. **Query `memberships` selalu filter `tenant_id`** — policy `own_memberships_select` memperlihatkan membership user sendiri di usaha lain
- **Super-admin (feature 07):** tanpa policy RLS apa pun. Baca lintas tenant **hanya** lewat `admin_tenant_overview()` (SECURITY DEFINER, menolak non-super-admin) yang mengembalikan kolom tingkat platform — kolom fungsi ini adalah batas data yang boleh dilihat super-admin (jangan tambah data karyawan/gaji). Tulis (buat tenant, nonaktifkan, kirim ulang undangan) memakai `withTenant({ tenantId: target, userId: superAdmin })` + cek `current_app_is_super_admin()` di transaksi (flag dari DB, bukan klaim JWT). Endpoint: `@SuperAdmin()`. Super-admin baru: skrip `pnpm --filter @exapay/api admin:create-super-admin -- --email … --name …` (password dari env `SUPER_ADMIN_PASSWORD`, role `app_owner`)
- **Tenant nonaktif:** `tenants.deactivated_at` (hanya super-admin/`app_owner` yang bisa mengubah — trigger `guard_tenant_deactivation`). Tenant nonaktif tidak masuk sesi; login ditolak 403 `code: "TENANT_DEACTIVATED"` jika semua usaha user nonaktif; refresh ditolak. Access token yang sudah terbit tetap berlaku ≤ 15 menit (web memutus lebih cepat: layout me-render `SessionEnded` → Server Action `logout` saat `/auth/me` menolak sesi. **Logout tidak pernah lewat route GET** — browser bisa prefetch/prerender URL dari riwayat. API tidak terjangkau/5xx → `SessionUnavailableError` → `app/error.tsx`, sesi tidak diakhiri)
- **Kode error API:** `{ success: false, error, code? }` — `code` (`API_ERROR_CODES` di shared) hanya untuk kasus yang harus dibedakan client, mis. `EMAIL_UNVERIFIED` vs `TENANT_DEACTIVATED` (keduanya 403). Lempar dengan `new ForbiddenException({ message, code })`
- **Reset password (feature 04):** `POST /auth/forgot-password` selalu 200 (tidak membocorkan email terdaftar); token acak 32 byte, hanya hash SHA-256 disimpan di `password_reset_tokens`, berlaku 60 menit, cooldown kirim ulang 60 detik, hanya tautan terbaru berlaku. `POST /auth/reset-password` → ganti password + tandai `used_at` + cabut semua refresh token user; 410 jika tautan tidak valid/kedaluwarsa/terpakai. Lookup hash tanpa konteks lewat `auth_find_password_reset()` (SECURITY DEFINER). Email dikirim di latar (fire-and-forget) — TODO pindah ke BullMQ

**Mekanisme (feature 03):**

- Password: argon2id (`@node-rs/argon2`, parameter default = rekomendasi OWASP). Email tidak terdaftar tetap menjalankan verify dummy (waktu respons tidak membocorkan akun)
- Access token: JWT HS256 15 menit, klaim `{ sub, tid, role, sa }`, secret `JWT_ACCESS_SECRET`
- Refresh token: JWT HS256 30 hari `{ sub, jti, fam }` (secret `JWT_REFRESH_SECRET`); `jti` = baris `refresh_tokens` (tenant aktif + status). **Rotasi** tiap refresh → `rotated_at`. Token yang sudah dirotasi dipakai ulang ≤ 30 detik → **tetap dilayani** (request paralel dari proxy Next.js); > 30 detik → seluruh family dicabut (indikasi pencurian). `revoked_at` (logout, reset password, pencurian) = tidak pernah berlaku lagi — dua kolom ini sengaja dipisah (migration `0003`)
- Web: cookie `exapay_access` & `exapay_refresh` (httpOnly, SameSite=Lax, Secure di production, path `/`). Mobile: kirim `client: "mobile"` → token di body, dipakai sebagai `Authorization: Bearer`; refresh token dikirim di body
- Endpoint: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/switch-tenant`, `POST /auth/logout` (publik — tetap jalan walau access token kedaluwarsa), `GET /auth/me`
- Tenant aktif: otomatis jika user hanya punya 1 membership; selain itu pilih lewat `switch-tenant` (rotasi refresh token dengan tenant baru). Peran di access token bisa basi maksimal 15 menit — refresh membaca ulang membership
- Fungsi SECURITY DEFINER membaca tabel lewat policy `definer_select` (`current_user = 'app_owner'`) — ada di `users`, `tenants`, `memberships`, `invitations`, dan tabel token. Jangan membuat policy yang memanggil fungsi definer yang membaca tabel ber-policy lain (risiko rekursi policy)
- Login tanpa konteks memakai fungsi `auth_find_user_by_email()` (SECURITY DEFINER milik `app_owner`); policy `definer_select` di `users` hanya berlaku untuk `current_user = 'app_owner'`
- `is_super_admin` hanya bisa diubah `app_owner` (trigger `guard_super_admin_flag`)

---

## Data Referensi Platform

- Tabel referensi lintas tenant (mis. `provinces`, `regencies`; nanti UMK/TER/BPJS di feature 24) **tanpa** `tenant_id`, tetapi tetap RLS + FORCE dengan policy `reference_read` (`FOR SELECT USING (true)`) dan grant `SELECT` saja ke app_user — aplikasi tidak bisa mengubahnya
- Isi/ubah data hanya lewat migration (dijalankan app_owner). Karena FORCE berlaku juga untuk app_owner dan policy hanya SELECT, migration seed melepas FORCE sementara (`NO FORCE` → INSERT → `FORCE`) dalam transaksi migration yang sama
- Dibaca tanpa `withTenant` (bukan data tenant) — beri komentar di service
- **Libur nasional (feature 13):** `national_holidays` (PK `date`, `kind` libur_nasional/cuti_bersama) mengikuti pola ini, diisi per tahun dari SKB 3 Menteri (migration 0011 dst.). Pilihan per usaha disimpan di tabel tenant `national_holiday_exclusions` (FK ke `national_holidays.date`, app_user SELECT/INSERT/DELETE). Jadwal `work_schedule_days` selalu 7 baris per tenant (app_user tanpa DELETE); `company_holidays` unik per (tenant, tanggal)

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
- **Implementasi (feature 11):** `FieldCipher` (`apps/api/src/common/crypto/`). Format `v1:<base64 iv12|ciphertext|tag16>`; AAD = `tenantId + nama kolom` (mis. `employees.nik`) — ciphertext yang dipindah ke tenant/kolom lain gagal didekripsi. Cari/cek duplikat lewat **blind index** HMAC-SHA256 (kunci turunan HKDF dari kunci utama, tenant ikut di-hash) di kolom `*_hash` + unique index parsial per tenant. `DATA_ENCRYPTION_KEY` = 32 byte base64 (`openssl rand -base64 32`), divalidasi saat start; **tidak boleh diganti setelah ada data** (rotasi = migrasi data terpisah, prefix `v2:`). Nilai sensitif hanya didekripsi untuk owner/admin: tersamar di detail, penuh lewat `POST /employees/:id/reveal` (audit `reveal_sensitive`). Isi nilai sensitif **tidak pernah** masuk audit log (hanya penanda "(diisi)/(diubah)")
- **FK antar tabel tenant wajib komposit `(tenant_id, x_id)` → `(tenant_id, id)`** (target diberi unique `(tenant_id, id)`): pemeriksaan FK tidak melewati RLS, jadi FK biasa membiarkan baris menunjuk data tenant lain. FK ke membership: `(tenant_id, user_id)` → `memberships` dengan `ON DELETE SET NULL (user_id)` (PG 15+) — SET NULL biasa ikut mengosongkan `tenant_id`

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
- **Implementasi (feature 15):** `FileStorage` (abstrak, `modules/storage/`) + `S3FileStorage` (`@aws-sdk/client-s3`, path-style). Env `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` wajib saat API start; bucket dibuat otomatis jika belum ada (storage mati tidak menggagalkan start). Key: `tenants/<tenant_id>/<fitur>/<id>/<uuid>.<ext>` — nama asli file hanya di DB. Jenis file diperiksa dari magic bytes di API. Unduh selalu lewat endpoint API yang memeriksa akses, diteruskan Route Handler web (browser tidak pernah ke storage). Upload dilakukan terakhir di transaksi (gagal → baris batal); commit gagal setelah upload → file dihapus best effort

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

**Catatan `db.execute` (SQL mentah):** kolom `timestamptz` dikembalikan sebagai **string**, bukan `Date` (Drizzle menimpa parser pg). Query builder Drizzle tetap mengembalikan `Date`.

**Test integrasi:** `pnpm --filter @exapay/api test` (butuh container postgres jalan). Global setup membuat database terpisah `exapayroll_test` (drop/create — hanya DB itu), menjalankan migration sebagai `app_owner`, test berjalan sebagai `app_user`, lalu DB test di-drop.
