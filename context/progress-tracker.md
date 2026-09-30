# Progress Tracker

Update file ini setiap selesai satu feature. Claude Code yang membaca file ini harus langsung tahu: apa yang sudah selesai, apa yang sedang dikerjakan, apa yang berikutnya.

---

## Status Saat Ini

**Phase:** 1 — Foundation
**Terakhir selesai:** 06 App Shell & Navigasi (2026-09-30)
**Berikutnya:** 07 Panel Super-Admin

---

## Progress

### Phase 1 — Foundation
- [x] 01 Setup Project
- [x] 02 Fondasi Multi-Tenant & RLS
- [x] 03 Auth Backend
- [x] 04 Halaman Login & Lupa Password
- [x] 05 Signup Owner & Verifikasi Email
- [x] 06 App Shell & Navigasi
- [ ] 07 Panel Super-Admin
- [ ] 08 Undang Pengguna & Kelola Peran

### Phase 2 — Master Data
- [ ] 09 Profil Usaha
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

---

## Catatan (Notes)

_Workaround, pola yang menyimpang dari context files, hal yang perlu diingat session berikutnya._

- Belum diputuskan (tidak memblokir MVP): model harga & paket, nama produk final & domain.
- `context/designs/` masih kosong. Gaya UI saat ini ditetapkan lewat `ui-rules.md` + `ui-tokens.md` (tema solvexaerp.tech, anti "AI slop"). Halaman baru tetap wajib melewati cek referensi di `ui-workflow.md`.
- Folder di luar struktur `architecture.md` (feature 01): `apps/api/src/common/config/` (skema env zod) dan `apps/api/src/redis/` (koneksi Redis global, analog `src/database/`). Sudah ditambahkan ke architecture.md.
- Redis lokal user memakai port 6379 → `.env` lokal memetakan Redis container ke host port **6380** (`REDIS_HOST_PORT`). Di dalam jaringan Docker tetap 6379.
- `.env` lokal berisi secret dev acak (tidak di-commit). Script init Postgres hanya jalan saat volume kosong — ganti password role perlu `docker compose down -v` (hapus data dev).
- `pnpm-workspace.yaml` berisi `minimumReleaseAgeExclude` untuk next@16.3.7 (ditambahkan otomatis pnpm 11 karena rilis masih baru) — boleh dihapus setelah umur rilis melewati batas.
- Bucket S3 belum dibuat — dibuat saat fitur pertama yang menyimpan file.
- Healthcheck container pakai `127.0.0.1`, bukan `localhost` (Alpine me-resolve `localhost` ke `::1`, API listen IPv4).
- Undang user (08): insert `users` untuk orang lain ditolak policy saat ini — perlu desain (fungsi definer/policy) di feature itu.
- `pnpm-workspace.yaml`: `allowBuilds.esbuild: true` (pnpm 11 menolak install drizzle-kit/vitest tanpa izin build script).
- Test RLS: `pnpm --filter @exapay/api test` butuh container postgres jalan. Test "semua tabel public RLS + FORCE" berisi daftar tabel eksplisit — update saat menambah tabel.
- **Belum ada rate limiting login** (brute force) — putuskan di feature 04 atau 38.
- Cookie sesi path `/` di domain web — sesuaikan jika reverse proxy production memakai prefix `/api` (feature 38).
- Email (reset password, verifikasi, pemberitahuan signup) dikirim fire-and-forget di proses API — belum tahan restart/tanpa retry. Pindahkan ke BullMQ saat infrastruktur antrean dibangun (feature 23/31 atau lebih awal).
- Test API (`pnpm --filter @exapay/api test`) butuh postgres, redis, **dan mailpit** jalan. Total 56 test per feature 05.
- Browser dev: HTTP 431 di localhost = cookie besar dari project lain di `localhost` (cookie tidak dipisah per port). Solusi: hapus data situs localhost, bukan menaikkan batas header.
- `pnpm dev` dari root menjalankan api (4000), web (3000), worker. Butuh `docker compose up -d postgres redis mailpit` dan migration terbaru.
