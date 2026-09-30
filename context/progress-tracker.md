# Progress Tracker

Update file ini setiap selesai satu feature. Claude Code yang membaca file ini harus langsung tahu: apa yang sudah selesai, apa yang sedang dikerjakan, apa yang berikutnya.

---

## Status Saat Ini

**Phase:** 2 — Master Data
**Terakhir selesai:** 09 Profil Usaha (2026-09-30)
**Berikutnya:** 10 Departemen & Jabatan

---

## Progress

### Phase 1 — Foundation
- [x] 01 Setup Project
- [x] 02 Fondasi Multi-Tenant & RLS
- [x] 03 Auth Backend
- [x] 04 Halaman Login & Lupa Password
- [x] 05 Signup Owner & Verifikasi Email
- [x] 06 App Shell & Navigasi
- [x] 07 Panel Super-Admin
- [x] 08 Undang Pengguna & Kelola Peran

### Phase 2 — Master Data
- [x] 09 Profil Usaha
- [ ] 10 Departemen & Jabatan
- [ ] 11 Daftar & Detail Karyawan
- [ ] 12 Impor Karyawan dari Excel

### Phase 3 — Absensi
- [ ] 13 Jadwal Kerja & Hari Libur
- [ ] 14 Absen Masuk/Pulang (Portal Karyawan)
- [ ] 15 Izin, Sakit, Cuti
- [ ] 16 Rekap & Koreksi Absensi
- [ ] 17 Aturan Potongan Absensi

### Phase 4 — Tugas Harian & KPI
- [ ] 18 Template KPI per Jabatan
- [ ] 19 Log Tugas Harian Karyawan
- [ ] 20 Verifikasi Atasan
- [ ] 21 Skor Ad-hoc

### Phase 5 — Penilaian Periodik & AI
- [ ] 22 Siklus & Penilaian Periodik
- [ ] 23 Ringkasan AI
- [ ] ⏸ Titik uji coba dengan 1–2 klien

### Phase 6 — Payroll
- [ ] 24 Data Regulasi Berlaku-Tanggal
- [ ] 25 Payroll Engine — Komponen & BPJS
- [ ] 26 Payroll Engine — PPh 21 TER & True-up Desember
- [ ] 27 Payroll Engine — Potongan Absensi
- [ ] 28 Komponen Gaji
- [ ] 29 Run Payroll — Draf & Review
- [ ] 30 Finalisasi Payroll
- [ ] 31 Slip Gaji PDF
- [ ] 32 Laporan & Ekspor Payroll

### Phase 7 — Kepatuhan, Dashboard & Portal
- [ ] 33 Kalender Kepatuhan
- [ ] 34 Peringatan UMK
- [ ] 35 Dashboard Owner/Admin
- [ ] 36 Dashboard Atasan
- [ ] 37 Portal Karyawan Lengkap & PWA

### Phase 8 — Siap Produksi
- [ ] 38 Backup & Deploy VPS

---

## Keputusan Selama Build (Decisions)

_Format: tanggal — keputusan — alasan._

- 2026-09-29 — Stack diganti dari Next.js full-stack + Supabase self-hosted menjadi NestJS (API) + PostgreSQL + BullMQ/Redis + Next.js (UI saja), monorepo pnpm + Turborepo, Docker Compose — mengikuti PROJECT_BRIEF bagian 5 atas permintaan user. `supabase-standards.md` diganti `database-standards.md`; folder `supabase/` dihapus.
- 2026-09-29 — Multi-tenancy: `tenant_id` + RLS (FORCE) + `set_config('app.tenant_id')` per transaksi; API memakai role Postgres non-owner — sesuai brief bagian 6.
- 2026-09-29 — ORM: **Drizzle** — pola transaksi + `set_config` untuk RLS natural, SQL transparan untuk policy/trigger di migration.
- 2026-09-29 — AI: **Claude** di balik lapisan abstraksi provider, kuota per tenant; AI hanya menulis narasi, skor KPI dihitung dengan rumus deterministik.
- 2026-09-29 — Semua infrastruktur self-hosted di VPS user (termasuk penyimpanan file S3-compatible). Pengecualian: email production lewat SMTP relay tier gratis (deliverability); dev pakai Mailpit.
- 2026-09-29 — Tugas harian dicatat sendiri oleh karyawan berdasarkan indikator template, diverifikasi atasan; hanya entri terverifikasi yang dihitung.
- 2026-09-29 — Absensi masuk MVP dengan potongan otomatis dari aturan terstruktur per tenant (berversi), tetap direview admin di draf payroll.
- 2026-09-29 — Periode KPI: skor ad-hoc untuk rentang bebas (target diprorata per hari kerja); penilaian resmi bersiklus per tenant (mingguan/bulanan/triwulanan), default bulanan.
- 2026-09-29 — Lembur dikeluarkan dari MVP (berbeda dari brief bagian 4). THR diinput manual; kalkulator otomatis di fase berikutnya.
- 2026-09-29 — Registrasi dua jalur: self-signup owner + pembuatan tenant oleh super-admin. Super-admin tidak bisa melihat data gaji/karyawan tenant.
- 2026-09-29 — Mobile native direncanakan di fase berikutnya; MVP PWA. Auth API dirancang agar mendukung Bearer token untuk client mobile nanti.
- 2026-09-29 — Nama produk sementara: **Exapay**.
- 2026-09-29 — Notifikasi WhatsApp tetap di fase berikutnya. Tahap uji coba memakai gateway self-hosted (WAHA/Evolution API) hanya untuk notifikasi ringan tanpa data sensitif (link ke app, bukan isi slip), fallback email. Lapisan abstraksi notifikasi dibuat sejak MVP (channel email).
- 2026-09-30 — Storage S3-compatible: **SeaweedFS** (`chrislusf/seaweedfs`, Apache-2.0). MinIO community tidak di-maintain lagi (image berhenti Okt 2025, repo dikunci Apr 2026); Garage layak tapi butuh init layout tambahan. Dev: kredensial admin S3 via env `AWS_ACCESS_KEY_ID/SECRET`; production pakai `-s3.config` dengan identitas terbatas (feature 38).
- 2026-09-30 — **NestJS 12 (ESM-only)** + TypeScript `~6.0` (bukan 7). API & worker dibangun dengan `tsc` langsung (bukan Nest CLI — CLI butuh Node ≥22.22.3). Semua workspace `"type": "module"`, import relatif berakhiran `.js`.
- 2026-09-30 — Role Postgres `app_owner`/`app_user` dibuat oleh `docker/postgres/init/01-roles.sh` (bukan migration — migration tidak bisa membuat role yang dipakainya sendiri). Grant tabel ada di migration (per tabel, tanpa default privileges — lihat keputusan feature 02).
- 2026-09-30 — Satu Dockerfile dev bersama untuk api/web/worker (beda `command`); image production ramping di feature 38.
- 2026-09-30 — Migration `0000_foundation_multi_tenant`: `tenants`, `users`, `memberships` (enum `membership_role`), `audit_logs` + RLS FORCE + trigger `updated_at`. Policy memakai `current_app_tenant_id()`/`current_app_user_id()` (nullif `''` — setting jadi `''` di koneksi pool setelah transaksi).
- 2026-09-30 — Grant `app_user` eksplisit per tabel, **tanpa** `ALTER DEFAULT PRIVILEGES` — tabel lupa grant gagal keras, bukan bocor diam-diam.
- 2026-09-30 — `users` juga ber-RLS: terlihat jika diri sendiri atau anggota tenant aktif; insert/update hanya baris sendiri (`app.user_id`). `audit_logs` append-only (app_user SELECT + INSERT); tenant & aktor diambil dari `TenantContext`.
- 2026-09-30 — Test integrasi RLS memakai database terpisah `exapayroll_test` (drop/create otomatis oleh vitest globalSetup via superuser dari `.env`).
- 2026-09-30 — Auth (feature 03): argon2id via `@node-rs/argon2`; access JWT 15 menit `{sub,tid,role,sa}`; refresh JWT 30 hari `{sub,jti,fam}` berotasi, baris di `refresh_tokens` (migration `0001`). Reuse > 30 detik setelah rotasi → seluruh family dicabut; ≤ 30 detik hanya ditolak (request paralel). Detail di `database-standards.md` bagian Auth.
- 2026-09-30 — Web: token hanya di cookie httpOnly (`exapay_access`/`exapay_refresh`, SameSite=Lax, path `/`). Mobile: `client: "mobile"` → token di body + Bearer.
- 2026-09-30 — `JwtAuthGuard` + `RolesGuard` global (`APP_GUARD`), endpoint publik wajib `@Public()`. `@Roles` menolak user tanpa tenant aktif. Tenant aktif otomatis jika hanya 1 membership, selain itu lewat `POST /auth/switch-tenant`.
- 2026-09-30 — Login tanpa konteks lewat fungsi `auth_find_user_by_email()` (SECURITY DEFINER, `app_owner`) + policy `definer_select` (`current_user = 'app_owner'`). User boleh membaca membership/tenant miliknya lintas tenant (policy `own_memberships_select`, `member_tenants_select`).
- 2026-09-30 — Trigger `guard_super_admin_flag`: `is_super_admin` hanya bisa diubah `app_owner` — super-admin dibuat lewat skrip/migration (feature 07).
- 2026-09-30 — Ditambahkan `AllExceptionsFilter` (format `{success:false,error}`), `ZodValidationPipe`, `app.setup.ts` (dipakai main.ts & test e2e), modul `email` (abstraksi `EmailTransport`, implementasi SMTP).
- 2026-09-30 — Halaman `/login`, `/forgot-password`, `/reset-password` dibangun **tanpa referensi visual** (opsi 3 ui-workflow, izin user) — hanya dari `ui-rules.md` + `ui-tokens.md`. Tema lalu diganti atas permintaan user agar mengacu **https://solvexaerp.tech/** (oranye `#f2790f`, krem, cokelat tua; DM Sans + Plus Jakarta Sans; tombol pill; card 22px) — detail di `ui-tokens.md` Riwayat Token. Panel kiri halaman auth: **foto orang bekerja** (Unsplash, disimpan lokal) + lapisan gelap rata — tanpa gradient/pendar (permintaan user). Gaya ini menjadi acuan halaman berikutnya.
- 2026-09-30 — Reset password (feature 04): token acak 32 byte, hanya hash SHA-256 di `password_reset_tokens` (migration `0002`, RLS per user + lookup `auth_find_password_reset()` SECURITY DEFINER), berlaku 60 menit, cooldown 60 detik, sekali pakai; reset mencabut semua refresh token. `forgot-password` selalu 200 (tanpa enumerasi email). Email dikirim fire-and-forget (belum BullMQ).
- 2026-09-30 — Refresh token: kolom `rotated_at` dipisah dari `revoked_at` (migration `0003`). Token yang dirotasi boleh dipakai ulang ≤ 30 detik (request paralel proxy Next.js) dan dilayani; token yang dicabut (logout/reset/pencurian) tidak pernah berlaku lagi. Menggantikan perilaku feature 03 (reuse dalam jendela = ditolak).
- 2026-09-30 — Web auth: browser hanya berbicara dengan web. Server Action (`apps/web/actions/auth.ts`) & `proxy.ts` (Next 16, pengganti middleware) meneruskan cookie sesi ke API dan `Set-Cookie` dari API ke browser. Proxy me-refresh sesi otomatis, redirect per peran (karyawan → `/me`, owner/admin/atasan → `/dashboard`, super-admin → `/admin/tenants`, multi usaha tanpa pilihan → langkah pilih usaha di `/login`). Klaim JWT di web dibaca tanpa verifikasi — hanya routing.
- 2026-09-30 — `/dashboard`, `/me`, `/admin/tenants` sementara memakai `SessionPlaceholder` (dilepas dari `/dashboard` & `/me` di feature 06; tersisa `/admin/tenants` → hapus component di 07). Skrip seed dev `pnpm --filter @exapay/api db:seed` (akun per peran, password `password123`).
- 2026-09-30 — `next.config.ts` hanya mengambil `API_INTERNAL_URL` dari `.env` root; secret API/DB tidak dimuat ke proses Next. Env baru API: `APP_WEB_URL`.
- 2026-09-30 — Signup (feature 05): `POST /auth/signup` membuat user + tenant + membership owner + audit log (`tenant/signup`) dalam satu `withTenant` (uuid dibuat di app), lalu token verifikasi di transaksi yang sama. **Sesi tidak dibuat** — login setelah verifikasi. Respons selalu sama (anti enumerasi): email terverifikasi → email pemberitahuan "sudah terdaftar" (cooldown 1 jam via Redis `signup:existing-notice:*`, dilewati jika Redis mati); terdaftar belum terverifikasi → kirim ulang tautan. Unique violation paralel diperlakukan sebagai email terdaftar.
- 2026-09-30 — Verifikasi email: `users.email_verified_at` (null = belum) + `email_verification_tokens` (migration `0004`, pola sama dengan reset password: hash SHA-256, RLS per user, lookup `auth_find_email_verification()` SECURITY DEFINER). Berlaku 24 jam, cooldown kirim ulang 60 detik, hanya tautan terbaru berlaku; verifikasi idempoten (token terpakai + user terverifikasi = sukses). `auth_find_user_by_email()` kini juga mengembalikan `email_verified_at` (DROP + CREATE).
- 2026-09-30 — Login akun belum terverifikasi → **403** (dicek setelah password benar; password salah tetap 401). Web memetakan 403 login ke state "unverified" + tombol kirim ulang. Akun lama dibackfill terverifikasi di migration (FORCE RLS `users` dilepas sementara di transaksi migration — tanpa itu UPDATE kena 0 baris). Seed & helper test membuat user dengan `emailVerifiedAt`. User buatan feature 07/08 wajib men-set `email_verified_at` saat undangan diterima.
- 2026-09-30 — Halaman `/signup` & `/verify-email` dibangun **tanpa referensi visual** (opsi 3 ui-workflow, izin user) — mengikuti gaya auth feature 04 (`AuthShell` + komponen form). `/verify-email` memverifikasi otomatis saat dibuka (client component → Server Action).
- 2026-09-30 — Data bawaan tenant baru: `seedTenantDefaults(tx, ctx)` di `apps/api/src/modules/tenants/tenant-defaults.ts` (placeholder, dipanggil di transaksi signup) — diisi feature 13/18/22/28; dipakai juga feature 07.

- 2026-09-30 — App shell (feature 06) dibangun **tanpa referensi visual** (opsi 3 ui-workflow, izin user) — hanya `ui-rules.md` + `ui-tokens.md`, tema sama dengan halaman auth. Area owner/admin/atasan: sidebar tetap ≥lg (`bg-surface border-r`), drawer di mobile; header berisi `TenantSwitcher` (kiri) + `UserMenu` avatar inisial (kanan, tombol Keluar). Portal `/me`: header ringkas + bottom nav 5 menu (`fixed`, safe-area), konten `max-w-lg`.
- 2026-09-30 — Menu: satu sumber `apps/web/lib/navigation.ts` (tanpa import component — ikut dimuat proxy) untuk sidebar, bottom nav, judul "Segera hadir", dan guard route. Peran mengikuti project-overview: atasan tidak melihat Payroll & Pengaturan (juga Koreksi absensi & Template KPI — khusus owner/admin); **Kepatuhan tetap terlihat atasan** (sesuai overview, bisa ditinjau di feature 33). Grup (Absensi, KPI, Payroll, Pengaturan) punya sub-menu yang terbuka hanya saat grup aktif; href grup = child pertama yang boleh dilihat peran.
- 2026-09-30 — `proxy.ts` menolak path menu di luar peran (`canAccessStaffPath`, tautan paling spesifik menang) → redirect ke halaman awal. Hanya routing; API tetap memeriksa peran.
- 2026-09-30 — Menu yang halamannya belum dibangun → catch-all `app/(main)/[...slug]/page.tsx` & `app/(portal)/me/[...slug]/page.tsx` menampilkan "Segera hadir" hanya untuk href menu yang persis sama; selain itu 404. Feature berikutnya cukup menambah `page.tsx` di route-nya (route statis menang atas catch-all) — tidak ada placeholder yang perlu dihapus.
- 2026-09-30 — `getSession()` dibungkus `React.cache` agar layout + page satu request hanya memanggil `GET /auth/me` sekali. Layout `(main)` & `(portal)` memuat sesi dan redirect cadangan (proxy tetap garis pertama).

- 2026-09-30 — **Acuan desain: Tema Glassmorphism** dari Claude Design (prompt `context/designs/claude-design-prompt.md`, export zip dari user). Snapshot: `context/designs/dashboard.html`, `me.html`, `design-tokens.html` (+ runtime `support.js`, `image-slot.js` agar bisa dibuka di browser). `ui-tokens.md` (bagian "Tema Glassmorphism — Token Target") & `ui-rules.md` ditulis ulang mengikuti desain. Diterapkan di kode pada redesign (entri berikut). Perubahan aturan: blur diizinkan hanya sebagai permukaan kaca; latar bentuk flat (default) atau foto; teks tombol primer `#221208` (bukan putih); `text-tertiary` untuk caption; portal maks 3 lapisan blur + mode solid.
- 2026-09-30 — Alur referensi desain: **Claude Design jadi jalur utama** (prompt disusun Claude Code setelah overview + build-plan → user generate → link/export → snapshot `context/designs/<halaman>.html` → token). Lihat `ui-workflow.md` "Jalur Claude Design"; `/plan-app` langkah 11.

- 2026-09-30 — **Redesign glassmorphism diterapkan** (sebelum feature 07, atas permintaan user): `globals.css` diganti token glassmorphism (nama lama dipertahankan jika perannya sama — pemetaan di `ui-tokens.md` "Nama Token di Kode"; `surface`, `surface-secondary`, `border`, `border-strong`, `shadow-card`, `shadow-accent` dihapus) + utilitas `glass`, `glass-strong`, `glass-overlay`, `surface-solid`, `animate-exa-pulse`, fallback solid (`@supports not backdrop-filter` + `prefers-reduced-transparency`). Semua component feature 04–06 disesuaikan. Baru: `BackdropShapes` (latar bentuk flat, `fixed -z-10`), `UserAvatar`, `buttonClassName()` (tautan bergaya tombol), `lib/datetime.ts` (`formatLongDate`, `greetingFor`, `firstNameOf`; zona waktu sementara `Asia/Jakarta` — TODO feature 09/13). Sidebar: grup dibuka/ditutup dengan klik (desain), bukan navigasi. Logo mengikuti placeholder desain ("e" + "exapay"). Halaman auth **tanpa snapshot** — diturunkan: panel foto mengambang `rounded-sheet` + card `glass-strong` di atas bentuk latar. `TenantPicker`: ikon kotak per baris dihapus.

- 2026-09-30 — Panel super-admin (feature 07) dibangun **tanpa referensi visual** (opsi 5 ui-workflow, izin user) — diturunkan dari pola snapshot glassmorphism (stat tile, card, badge, dropdown). `/admin` memakai `AppShell` yang sama dengan area usaha: sisi kiri header kini slot `headerStart` (TenantSwitcher / judul "Panel Super-admin"), menu `ADMIN_MENU`. Komponen dasar baru: `Badge`, `StatTile`, `Dialog` (native `<dialog>`), `Pagination`. `SessionPlaceholder` dihapus.
- 2026-09-30 — **Super-admin tanpa policy RLS.** Rencana awal (policy yang memanggil `current_app_is_super_admin()`) ditolak karena risiko rekursi policy (fungsi membaca `users` → policy `users` membaca `memberships` → policy `memberships` memanggil fungsi). Baca lintas tenant hanya lewat `admin_tenant_overview()` (SECURITY DEFINER) yang mengembalikan kolom tingkat platform — batas "tanpa data karyawan/gaji" dijaga database. Tulis lewat `withTenant(tenant target)` + cek flag super-admin dari DB di transaksi (klaim JWT bisa basi 15 menit). Migration `0005`.
- 2026-09-30 — **Undangan dibangun di feature 07** (bukan 08, atas persetujuan user): tabel `invitations`, `/invite/[token]`, `POST /invitations/lookup|accept`. Berlaku 7 hari, hanya undangan terbaru per (tenant, email) berlaku, cooldown kirim ulang 60 detik. Email terdaftar → cukup terima (password lama). Menerima undangan men-set `email_verified_at`. Feature 08 memakai ulang `InvitationsService`.
- 2026-09-30 — **Tenant nonaktif:** `tenants.deactivated_at` (trigger: hanya super-admin/`app_owner`). Tenant nonaktif disaring dari sesi; login ditolak 403 `TENANT_DEACTIVATED` jika semua usaha user nonaktif; refresh ditolak. Access token yang sudah terbit masih berlaku ≤ 15 menit untuk panggilan API langsung (web memutus lebih cepat). Ditambah "Aktifkan kembali" agar penonaktifan bisa dibatalkan.
- 2026-09-30 — Respons error API punya `code` opsional (`API_ERROR_CODES`: `EMAIL_UNVERIFIED`, `TENANT_DEACTIVATED`) — web tidak lagi menebak dari status 403.
- 2026-09-30 — **Sesi di web:** `getSession()` → `null` hanya jika API menolak (401/403); API tidak terjangkau/5xx → `SessionUnavailableError` → `app/error.tsx` (tombol coba lagi, sesi tetap). Proxy tidak menghapus cookie saat refresh gagal karena API tidak terjangkau. Sesi ditolak → layout me-render `SessionEnded` → Server Action `logout` (POST). **Logout tidak boleh lewat route GET**: route `/signout` (GET) sempat dibuat lalu dihapus — Chrome "Preload pages" memuatnya dari riwayat dan mengeluarkan super-admin setiap kali login.
- 2026-09-30 — **Kelola pengguna (feature 08):** modul `users` (`GET /users`, `POST /users/invitations`, `/users/invitations/:id/resend|cancel`, `/users/:membershipId/role|revoke`, semua `@Roles("owner","admin")`). Wewenang = `MANAGEABLE_ROLES` di `@exapay/shared` (sumber tunggal api & web): owner → semua peran, admin → atasan & karyawan; tidak ada yang mengubah/mencabut dirinya sendiri; usaha minimal satu owner (dicek setelah perubahan di transaksi yang sama). Peran pengelola **dibaca ulang dari DB** di setiap aksi (klaim JWT bisa basi 15 menit). Tanpa migration.
- 2026-09-30 — Query `memberships` wajib difilter `tenant_id` walau ada RLS: policy `own_memberships_select` juga memperlihatkan membership user sendiri di usaha lain.
- 2026-09-30 — Cabut akses = hapus membership (akun tetap, bisa diundang lagi). Sesi pengguna tsb kehilangan usaha saat refresh berikutnya; access token lama masih berlaku ≤ 15 menit untuk endpoint lain (sama dengan tenant nonaktif). Undang email yang sudah anggota → 409; undang ulang email tertunda menggantikan undangan lama (cooldown 60 detik); admin tidak bisa menimpa/mengelola undangan owner/admin. `InvitationsService.create` kini mengembalikan `{ id, token }`.
- 2026-09-30 — `/settings/users` dibangun **tanpa referensi visual** (opsi turunkan dari pola, izin user) — pola feature 07 (TenantTable, Dialog, Badge). `Dialog` kini `text-left` (dialog di dalam sel tabel rata kanan ikut mewarisi perataan).
- 2026-09-30 — **Profil usaha (feature 09):** kolom di `tenants` (migration `0006`): `address`, `npwp` (hanya digit, CHECK 15/16 digit — **tidak dienkripsi**, identitas pajak perusahaan bukan data pribadi; keputusan user), `regency_code` (FK `regencies`), `payday` smallint (CHECK 1–31; bulan lebih pendek = hari terakhir bulan). Semua nullable. `GET`/`PUT /company` (owner/admin); audit `tenant/update_profile` hanya kolom yang berubah, tanpa perubahan = tanpa audit. Nama usaha berubah → web `revalidatePath("/", "layout")` agar header ikut.
- 2026-09-30 — **Referensi wilayah** (keputusan user: tabel, bukan teks bebas): `provinces` (kode 2 digit + `time_zone` IANA WIB/WITA/WIT) & `regencies` (kode `PP.KK`) — data platform tanpa `tenant_id`, RLS + FORCE + policy `reference_read` (SELECT semua), app_user hanya SELECT. Seed migration `0007`: 38 provinsi + 514 kab/kota Kepmendagri 300.2.2-2138/2025 (sumber `cahyadsn/wilayah`, MIT). Seed melepas FORCE sementara (policy hanya SELECT, FORCE berlaku juga untuk app_owner). Perubahan wilayah = migration baru. `GET /regions` (cukup login) dibaca tanpa `withTenant`. `time_zone` belum dipakai — sambungkan ke `lib/datetime.ts` di feature 13.
- 2026-09-30 — `/settings/company` dibangun **tanpa referensi visual** (opsi turunkan dari pola, izin user). Pola form pengaturan: card `glass-strong` dengan section 2 kolom (judul+penjelasan | field). Komponen dasar baru `SelectField` (select native) & `TextAreaField`. `apiRequest` kini mendukung `PUT`.
- 2026-09-30 — Super-admin production dibuat dengan `pnpm --filter @exapay/api admin:create-super-admin -- --email … --name …` (password dari env `SUPER_ADMIN_PASSWORD`, role `app_owner`; akun lama cukup dipromosikan).

---

## Catatan (Notes)

_Workaround, pola yang menyimpang dari context files, hal yang perlu diingat session berikutnya._

- Belum diputuskan (tidak memblokir MVP): model harga & paket, nama produk final & domain.
- `context/designs/` berisi snapshot glassmorphism (dashboard, portal `/me`, token & komponen). Halaman lain belum punya desain — turunkan dari pola snapshot + `ui-rules.md`, tetap lewat cek referensi `ui-workflow.md` (tawarkan prompt Claude Design untuk halaman yang polanya belum ada, mis. tabel data, form panjang, halaman auth versi kaca).
- Elemen di desain yang belum didukung fitur: "Daftarkan usaha baru" di dropdown tenant (signup saat ini hanya untuk email baru), hitungan tertunda di sidebar (butuh data feature 15/20), kota di sub-judul tenant (feature 09). Logo di desain berupa placeholder "e" + wordmark "exapay" (huruf kecil) — berbeda dari `ExapayLogo` sekarang; putuskan saat redesign.
- Folder di luar struktur `architecture.md` (feature 01): `apps/api/src/common/config/` (skema env zod) dan `apps/api/src/redis/` (koneksi Redis global, analog `src/database/`). Sudah ditambahkan ke architecture.md.
- Redis lokal user memakai port 6379 → `.env` lokal memetakan Redis container ke host port **6380** (`REDIS_HOST_PORT`). Di dalam jaringan Docker tetap 6379.
- `.env` lokal berisi secret dev acak (tidak di-commit). Script init Postgres hanya jalan saat volume kosong — ganti password role perlu `docker compose down -v` (hapus data dev).
- `pnpm-workspace.yaml` berisi `minimumReleaseAgeExclude` untuk next@16.3.7 (ditambahkan otomatis pnpm 11 karena rilis masih baru) — boleh dihapus setelah umur rilis melewati batas.
- Bucket S3 belum dibuat — dibuat saat fitur pertama yang menyimpan file.
- Healthcheck container pakai `127.0.0.1`, bukan `localhost` (Alpine me-resolve `localhost` ke `::1`, API listen IPv4).
- `pnpm-workspace.yaml`: `allowBuilds.esbuild: true` (pnpm 11 menolak install drizzle-kit/vitest tanpa izin build script).
- Test RLS: `pnpm --filter @exapay/api test` butuh container postgres jalan. Test "semua tabel public RLS + FORCE" berisi daftar tabel eksplisit — update saat menambah tabel.
- **Belum ada rate limiting login** (brute force) — putuskan di feature 04 atau 38.
- Cookie sesi path `/` di domain web — sesuaikan jika reverse proxy production memakai prefix `/api` (feature 38).
- Email (reset password, verifikasi, pemberitahuan signup) dikirim fire-and-forget di proses API — belum tahan restart/tanpa retry. Pindahkan ke BullMQ saat infrastruktur antrean dibangun (feature 23/31 atau lebih awal).
- Test API (`pnpm --filter @exapay/api test`) butuh postgres, redis, **dan mailpit** jalan. Total 83 test per feature 09.
- Browser dev: HTTP 431 di localhost = cookie besar dari project lain di `localhost` (cookie tidak dipisah per port). Solusi: hapus data situs localhost, bukan menaikkan batas header.
- `pnpm dev` dari root menjalankan api (4000), web (3000), worker. Butuh `docker compose up -d postgres redis mailpit` dan migration terbaru.
- Daftar tenant super-admin difilter & dipaginasi di aplikasi (semua baris `admin_tenant_overview()`); pindahkan ke SQL jika tenant sudah ribuan.
- `db.execute()` (SQL mentah Drizzle) mengembalikan `timestamptz` sebagai string, bukan `Date`.
- Test e2e: jangan `await` request supertest lain di dalam argumen request yang sedang dibangun (`.set(..., await tokenOf())`) — keduanya berbagi `http.Server` dan request pertama kena `ECONNREFUSED`. Hitung token lebih dulu.
- Headless Chrome (verifikasi visual): halaman auth tidak pernah memicu event `load` (gambar tersembunyi AuthShell) — pakai `waitUntil: "commit"` + jeda hydration.
- Data dev berisi beberapa tenant uji "Konveksi Uji …" / "Usaha Smoke" dari verifikasi feature 07, dan akun `*@contoh.local` tanpa usaha dari verifikasi feature 08 — boleh diabaikan. Profil "Kopi Nusantara" berisi data contoh (Kota Makassar, gajian tgl 25, NPWP contoh) dari verifikasi feature 09.
- Component yang dirender dua kali (tabel desktop + daftar mobile) tidak boleh memakai `name`/`id` statis — pakai `useId` (grup radio bernama sama saling menimpa status checked).
