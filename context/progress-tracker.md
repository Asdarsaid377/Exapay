# Progress Tracker

Update file ini setiap selesai satu feature. Claude Code yang membaca file ini harus langsung tahu: apa yang sudah selesai, apa yang sedang dikerjakan, apa yang berikutnya.

---

## Status Saat Ini

**Phase:** 1 — Foundation
**Terakhir selesai:** 02 Fondasi Multi-Tenant & RLS (2026-09-30)
**Berikutnya:** 03 Auth Backend

---

## Progress

### Phase 1 — Foundation
- [x] 01 Setup Project
- [x] 02 Fondasi Multi-Tenant & RLS
- [ ] 03 Auth Backend
- [ ] 04 Halaman Login & Lupa Password
- [ ] 05 Signup Owner & Verifikasi Email
- [ ] 06 App Shell & Navigasi
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

---

## Catatan (Notes)

_Workaround, pola yang menyimpang dari context files, hal yang perlu diingat session berikutnya._

- Belum diputuskan (tidak memblokir MVP): model harga & paket, nama produk final & domain.
- Referensi desain di `context/designs/` belum ada — wajib sebelum feature UI pertama (04).
- Folder di luar struktur `architecture.md` (feature 01): `apps/api/src/common/config/` (skema env zod) dan `apps/api/src/redis/` (koneksi Redis global, analog `src/database/`). Sudah ditambahkan ke architecture.md.
- Redis lokal user memakai port 6379 → `.env` lokal memetakan Redis container ke host port **6380** (`REDIS_HOST_PORT`). Di dalam jaringan Docker tetap 6379.
- `.env` lokal berisi secret dev acak (tidak di-commit). Script init Postgres hanya jalan saat volume kosong — ganti password role perlu `docker compose down -v` (hapus data dev).
- `pnpm-workspace.yaml` berisi `minimumReleaseAgeExclude` untuk next@16.3.7 (ditambahkan otomatis pnpm 11 karena rilis masih baru) — boleh dihapus setelah umur rilis melewati batas.
- Bucket S3 belum dibuat — dibuat saat fitur pertama yang menyimpan file.
- Healthcheck container pakai `127.0.0.1`, bukan `localhost` (Alpine me-resolve `localhost` ke `::1`, API listen IPv4).
- **Untuk feature 03:** login by email (tanpa konteks) butuh fungsi `SECURITY DEFINER` khusus di migration baru; tenant switcher butuh policy SELECT membership/tenant milik user sendiri (`user_id = current_app_user_id()`). Signup (05): generate uuid tenant/user di app, set konteks ke id itu, lalu insert — policy sudah mendukung.
- Undang user (08): insert `users` untuk orang lain ditolak policy saat ini — perlu desain (fungsi definer/policy) di feature itu.
- `pnpm-workspace.yaml`: `allowBuilds.esbuild: true` (pnpm 11 menolak install drizzle-kit/vitest tanpa izin build script).
- Test RLS: `pnpm --filter @exapay/api test` butuh container postgres jalan. Test "semua tabel public RLS + FORCE" berisi daftar tabel eksplisit — update saat menambah tabel.
