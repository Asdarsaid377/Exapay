# Progress Tracker

Update file ini setiap selesai satu feature. Claude Code yang membaca file ini harus langsung tahu: apa yang sudah selesai, apa yang sedang dikerjakan, apa yang berikutnya.

---

## Status Saat Ini

**Phase:** 1 — Foundation
**Terakhir selesai:** Perencanaan (`/plan-app`) — project-overview & build-plan terisi
**Berikutnya:** 01 Setup Project

---

## Progress

### Phase 1 — Foundation
- [ ] 01 Setup Project
- [ ] 02 Fondasi Multi-Tenant & RLS
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

---

## Catatan (Notes)

_Workaround, pola yang menyimpang dari context files, hal yang perlu diingat session berikutnya._

- Masih `[PUTUSKAN]`: server penyimpanan S3-compatible (MinIO/Garage/SeaweedFS — verifikasi status lisensi & maintenance saat feature 01).
- Belum diputuskan (tidak memblokir MVP): model harga & paket, nama produk final & domain.
- Referensi desain di `context/designs/` belum ada — wajib sebelum feature UI pertama (04).
