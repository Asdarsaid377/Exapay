# Build Plan — Exapay MVP

## Prinsip Inti

**UI halaman penuh dengan mock data dulu — diverifikasi visual sebelum logic ditulis.** Setelah UI benar, fungsionalitas dibangun dan di-wiring ke UI selangkah demi selangkah. Setiap feature harus terlihat dan bisa dites sebelum lanjut ke berikutnya.

Urutan pengerjaan setiap halaman:

1. Referensi desain dikonfirmasi (lihat `ui-workflow.md`)
2. UI lengkap dengan mock data → verifikasi visual oleh user
3. Schema database (migration via `/db-change`) jika halaman butuh data baru
4. Endpoint NestJS + wiring ke UI
5. Edge cases: loading, error, empty state
6. Update `progress-tracker.md` + `ui-registry.md`

**Pengecualian:** feature fondasi tanpa UI (RLS, payroll-engine, data regulasi) diverifikasi lewat **test otomatis yang dijalankan di depan user**, bukan visual.

Aturan yang berlaku di semua feature: tabel bisnis wajib `tenant_id` + RLS (FORCE) + test isolasi; uang `numeric` + decimal.js; aturan regulasi sebagai data berlaku-tanggal; mutasi data sensitif masuk audit log; skor/ringkasan AI tidak final tanpa review atasan.

> **Titik uji coba:** setelah Phase 5 selesai, uji coba absensi + KPI dengan 1–2 klien sebelum membangun Phase 6 (payroll).

---

## Phase 1 — Foundation

### 01 Setup Project
- Monorepo pnpm + Turborepo: `apps/api` (NestJS), `apps/web` (Next.js + Tailwind v4), `apps/worker`, `packages/shared`, `packages/payroll-engine`, `packages/db`
- Docker Compose: api, web, worker, postgres, redis, mailpit, penyimpanan S3-compatible self-hosted (verifikasi status lisensi/maintenance MinIO vs Garage vs SeaweedFS, pilih, catat di Decisions)
- `.env.example` lengkap; TypeScript strict di semua workspace
- `apps/web/app/globals.css` dengan token dari `ui-tokens.md`
- **Verifikasi:** `docker compose up` jalan; `GET /health` API merespons (cek DB + Redis); halaman web kosong tampil dengan background token; Mailpit UI terbuka

### 02 Fondasi Multi-Tenant & RLS
- Setup Drizzle + migration pertama: role `app_owner` / `app_user`, tabel `tenants`, `users`, `memberships`, `audit_logs`, trigger `updated_at`
- Helper transaksi ber-tenant di `apps/api/src/database/` (`set_config('app.tenant_id', ..., true)`)
- Helper penulisan audit log
- **Verifikasi:** test otomatis — data tenant A tidak terbaca/tertulis dari konteks tenant B; query tanpa tenant context tidak mengembalikan baris; `app_user` bukan owner tabel

### 03 Auth Backend
- Modul auth NestJS: hash password (argon2), access + refresh token, cookie httpOnly; desain juga mendukung `Authorization: Bearer` untuk client mobile di masa depan
- `JwtAuthGuard`, `RolesGuard`, `@Roles`, `@CurrentUser`, pemilihan tenant aktif
- Modul email (SMTP abstraksi → Mailpit di dev)
- **Verifikasi:** test e2e login/refresh/logout; endpoint terproteksi menolak tanpa token dan peran salah

### 04 Halaman Login & Lupa Password
**UI:** `/login`, `/forgot-password`, `/reset-password` sesuai desain
**Logic:** wiring ke auth API, middleware proteksi route di web, redirect sesuai peran
- **Verifikasi:** login → redirect benar per peran; reset password lewat email di Mailpit

### 05 Signup Owner & Verifikasi Email
**UI:** `/signup`, `/verify-email`
**Logic:** buat user + tenant + membership owner dalam satu transaksi; seed default tenant (placeholder — data regulasi/template diisi feature terkait)
- **Verifikasi:** daftar → email verifikasi di Mailpit → login → masuk dashboard kosong

### 06 App Shell & Navigasi
**UI:** layout sidebar (owner/admin/atasan, drawer di mobile), bottom nav portal karyawan `/me`, tenant switcher, halaman dashboard kosong
**Logic:** menu disaring per peran
- **Verifikasi:** login sebagai tiap peran → menu sesuai; tampilan mobile benar

### 07 Panel Super-Admin
**UI:** `/admin/tenants`, `/admin/tenants/[id]`
**Logic:** buat tenant + undang owner, nonaktifkan tenant (tenant nonaktif tidak bisa login), statistik dasar; super-admin tanpa akses data gaji/karyawan
- **Verifikasi:** buat tenant → owner menerima email → login; nonaktifkan → login ditolak

### 08 Undang Pengguna & Kelola Peran
**UI:** `/settings/users`, `/invite/[token]`
**Logic:** undangan berbatas waktu, terima undangan & set password, ubah peran, cabut akses
- **Verifikasi:** undang atasan & karyawan → terima → login dengan menu sesuai peran

---

## Phase 2 — Master Data

### 09 Profil Usaha
**UI:** `/settings/company`
**Logic:** nama, alamat, NPWP badan, kota/kabupaten, tanggal gajian
- **Verifikasi:** simpan & tampil kembali; audit log tercatat

### 10 Departemen & Jabatan
**UI:** `/organization`
**Logic:** CRUD departemen & jabatan
- **Verifikasi:** tambah/ubah/hapus; empty state tampil

### 11 Daftar & Detail Karyawan
**UI:** `/employees`, `/employees/new`, `/employees/[id]` (tab Data)
**Logic:** CRUD karyawan; enkripsi AES-GCM NIK/NPWP/rekening + tampilan termasking; PTKP, status, tanggal kontrak/percobaan, atasan langsung
- **Verifikasi:** data sensitif tersimpan terenkripsi di DB; atasan hanya melihat bawahannya

### 12 Impor Karyawan dari Excel
**UI:** `/employees/import` — unduh template, unggah, pratinjau dengan error per baris
**Logic:** parsing & validasi (zod), simpan dalam transaksi
- **Verifikasi:** impor file contoh 30 baris dengan beberapa baris salah → error jelas, baris valid tersimpan setelah konfirmasi

---

## Phase 3 — Absensi

### 13 Jadwal Kerja & Hari Libur
**UI:** `/settings/attendance` (bagian jadwal & libur)
**Logic:** jadwal default per tenant (hari & jam kerja), daftar hari libur nasional + custom; fungsi hitung hari kerja untuk rentang tanggal (dipakai KPI & payroll)
- **Verifikasi:** unit test hitung hari kerja; UI simpan jadwal

### 14 Absen Masuk/Pulang (Portal Karyawan)
**UI:** `/me` (kartu absen), `/me/attendance` (riwayat)
**Logic:** waktu dari server, GPS opsional dicatat, status telat dihitung dari jadwal
- **Verifikasi:** absen dari HP (atau devtools mobile) → tercatat, telat terdeteksi

### 15 Izin, Sakit, Cuti
**UI:** form pengajuan di `/me/attendance`, persetujuan di `/attendance/requests`
**Logic:** pengajuan + lampiran opsional (storage S3-compatible), persetujuan atasan
- **Verifikasi:** karyawan ajukan → atasan setujui → status di rekap berubah

### 16 Rekap & Koreksi Absensi
**UI:** `/attendance`, `/attendance/corrections`
**Logic:** rekap per periode (hadir, telat menit, alpa, izin, sakit, cuti); koreksi admin + audit log
- **Verifikasi:** koreksi mengubah rekap dan tercatat di audit log

### 17 Aturan Potongan Absensi
**UI:** `/settings/attendance` (bagian aturan)
**Logic:** simpan aturan terstruktur berversi (`effective_from`/`effective_to`) sesuai tabel di `project-overview.md`; pratinjau potongan untuk satu karyawan contoh (perhitungan dari `payroll-engine`)
- **Verifikasi:** unit test tiap jenis aturan; ubah aturan → versi lama tetap tersimpan

---

## Phase 4 — Tugas Harian & KPI

### 18 Template KPI per Jabatan
**UI:** `/kpi/templates`
**Logic:** indikator, bobot (total 100%), target + satuan waktu, tipe; 3–5 template bawaan (sales, kasir, admin gudang, staf produksi); salin & edit
- **Verifikasi:** validasi bobot ≠ 100% ditolak; template bawaan tersedia di tenant baru

### 19 Log Tugas Harian Karyawan
**UI:** `/me/tasks`, kartu "tugas hari ini" di `/me`
**Logic:** pilih indikator dari template jabatan, isi realisasi, catatan, foto opsional
- **Verifikasi:** karyawan mencatat dari HP; foto tersimpan & bisa dilihat

### 20 Verifikasi Atasan
**UI:** `/kpi/verification`
**Logic:** setuju / tolak (dengan alasan) / koreksi angka; hanya bawahan langsung
- **Verifikasi:** hanya entri terverifikasi yang muncul di perhitungan skor

### 21 Skor Ad-hoc
**UI:** `/kpi/scores` (pilih rentang bebas, per karyawan/tim), ringkasan di `/me/performance`
**Logic:** fungsi skor murni: target diprorata per hari kerja, capaian maks 120%, bobot, predikat; indikator penilaian hanya jika sudah dinilai; indikator kehadiran dari rekap absensi
- **Verifikasi:** unit test skenario skor; angka UI cocok dengan hitung manual

---

## Phase 5 — Penilaian Periodik & AI

### 22 Siklus & Penilaian Periodik
**UI:** `/settings/kpi`, `/kpi/reviews`, `/kpi/reviews/[id]` (tanpa AI dulu)
**Logic:** siklus per tenant (mingguan/bulanan/triwulanan, tidak tumpang-tindih); pembuatan penilaian per periode; atasan mengisi nilai indikator penilaian; status draft → direview → final; snapshot saat final
- **Verifikasi:** penilaian final terkunci; perubahan log sesudahnya tidak mengubah skor final

### 23 Ringkasan AI
**Logic:** lapisan abstraksi provider AI (implementasi Claude — verifikasi model & API terbaru saat implementasi); job BullMQ di worker; simpan input terstruktur, output, versi prompt; kuota per tenant per bulan
**UI:** panel narasi AI di `/kpi/reviews/[id]` — generate ulang, edit, status
- **Verifikasi:** narasi terbentuk dari data terstruktur; atasan bisa edit; kuota habis → pesan jelas; tidak bisa final tanpa review

> **Titik uji coba dengan 1–2 klien.**

---

## Phase 6 — Payroll

### 24 Data Regulasi Berlaku-Tanggal
**Logic:** tabel & seed: tarif + batas upah BPJS, tabel TER PPh 21 (kategori A/B/C), PTKP, tarif Pasal 17, UMK per kota — semua dengan `effective_from`/`effective_to`; sumber resmi dicatat di seed
- **Verifikasi:** query aturan untuk tanggal tertentu mengembalikan versi yang benar (test)

### 25 Payroll Engine — Komponen & BPJS
**Logic:** `packages/payroll-engine`: gaji pokok, tunjangan tetap/tidak tetap, potongan; BPJS Kesehatan & Ketenagakerjaan (JHT, JP, JKK, JKM) porsi perusahaan & karyawan dengan batas upah; output berisi rincian langkah
- **Verifikasi:** unit test banyak skenario termasuk di atas/bawah batas upah dan pembulatan

### 26 Payroll Engine — PPh 21 TER & True-up Desember
**Logic:** TER bulanan per kategori PTKP; true-up Desember (tarif Pasal 17 atas penghasilan setahun dikurangi PPh yang sudah dipotong); THR/pendapatan tidak tetap ikut dasar bulan dibayar
- **Verifikasi:** unit test skenario resmi (contoh perhitungan DJP) + karyawan masuk tengah tahun

### 27 Payroll Engine — Potongan Absensi
**Logic:** terapkan aturan tenant (feature 17) ke rekap absensi → baris potongan + penjelasan teks
- **Verifikasi:** unit test tiap kombinasi aturan

### 28 Komponen Gaji
**UI:** `/settings/salary-components`, tab Gaji di `/employees/[id]`
**Logic:** template komponen bawaan; nilai komponen per karyawan (berlaku-tanggal)
- **Verifikasi:** komponen tersimpan & tampil di detail karyawan

### 29 Run Payroll — Draf & Review
**UI:** `/payroll`, `/payroll/[id]`
**Logic:** buka periode → susun draf via engine; admin tambah pendapatan tidak tetap (THR) & sesuaikan baris; rincian per karyawan dengan penjelasan
- **Verifikasi:** angka draf cocok dengan hitung manual untuk 3 karyawan contoh

### 30 Finalisasi Payroll
**Logic:** finalisasi dalam satu transaksi → snapshot immutable (input, hasil, versi aturan) + audit log; koreksi lewat adjustment periode berikutnya
- **Verifikasi:** payroll final tidak bisa diubah; audit log lengkap

### 30b Tanggal Tutup Buku Absensi
**Logic:** tanggal tutup buku (cut-off) absensi per usaha (1–28 atau akhir bulan, bawaan akhir bulan). Periode payroll bulan M = hari setelah tutup buku bulan M−1 s.d. tanggal tutup buku bulan M — absensi, potongan, dan prorata masuk/keluar mengikuti rentang ini; gaji tetap sebulan, PPh 21 masa & iuran BPJS tetap bulan M. Finalisasi bisa mulai sehari setelah tutup buku. Label "Masuk"/"Keluar" di daftar payroll.
**UI:** isian tanggal tutup buku di Profil usaha (dekat tanggal gajian), rentang periode di `/payroll` & `/payroll/[id]`, rekap absensi mengikuti periode tutup buku
- **Verifikasi:** usaha dengan tutup buku 25 & gajian 28 bisa finalisasi tanggal 26; alpa 26–30 dihitung di periode berikutnya; karyawan masuk/keluar diprorata sesuai rentang

### 31 Slip Gaji PDF
**Logic:** job BullMQ di worker → PDF → storage S3-compatible → email ke karyawan
**UI:** `/payroll/[id]/slips`, `/me/payslips`
- **Verifikasi:** slip terbentuk & bisa diunduh hanya oleh yang berhak; email di Mailpit

### 32 Laporan & Ekspor Payroll
**UI:** `/payroll/reports`
**Logic:** rekap total gaji, BPJS, PPh 21 per periode; ekspor Excel (daftar transfer bank, rekap setor)
- **Verifikasi:** total laporan = jumlah slip; file Excel terbuka benar

---

## Phase 7 — Kepatuhan, Dashboard & Portal

### 33 Kalender Kepatuhan
**UI:** `/compliance`
**Logic:** generator pengingat (setor BPJS, setor/lapor PPh 21, kontrak habis, percobaan selesai) via job terjadwal BullMQ; email H-7/H-1
- **Verifikasi:** data contoh → pengingat muncul di tanggal benar; email terkirim ke Mailpit

### 34 Peringatan UMK
**Logic:** bandingkan gaji pokok karyawan dengan UMK kota tenant yang berlaku
**UI:** badge peringatan di daftar karyawan & kalender kepatuhan
- **Verifikasi:** karyawan di bawah UMK tertandai

### 35 Dashboard Owner/Admin
**UI:** `/dashboard` — biaya gaji, rekap kehadiran, sebaran skor KPI, pengingat, tindakan tertunda
- **Verifikasi:** angka cocok dengan halaman sumbernya

### 36 Dashboard Atasan
**UI:** `/dashboard` versi atasan — log menunggu verifikasi, pengajuan izin, penilaian perlu review
- **Verifikasi:** hanya data bawahan langsung

### 37 Portal Karyawan Lengkap & PWA
**UI:** `/me/performance`, `/me/profile`, penyempurnaan `/me`
**Logic:** manifest + service worker (installable), tampilan offline sederhana
- **Verifikasi:** bisa di-install di HP; semua menu karyawan berfungsi

### 37b Tab KPI & Absensi Detail Karyawan
**UI:** tab KPI & Absensi di `/employees/[id]` (sebelumnya "Segera hadir" — tidak pernah dijadwalkan; sisipan, keputusan user 2026-10-02). Tab di URL (`?tab=`), navigasi bulan per tab
**Logic:** Absensi = rincian harian + ringkasan periode tutup buku (endpoint rekap per karyawan feature 16); KPI = skor bulan terpilih + rincian indikator (rumus feature 21) + riwayat penilaian periodik karyawan tsb (semua status, tautan ke `/kpi/reviews/[id]`). Cakupan sama: owner/admin semua, atasan bawahan langsung
- **Verifikasi:** angka tab cocok dengan `/attendance/corrections` & `/kpi/scores`; atasan tidak bisa membuka karyawan di luar bawahannya

---

## Phase 8 — Siap Produksi

### 38 Backup & Deploy VPS
- Docker Compose production + reverse proxy (web & `/api` satu domain, HTTPS)
- Backup Postgres + storage terjadwal ke luar server; uji restore
- Konfigurasi SMTP relay tier gratis untuk production
- **Verifikasi:** deploy ke VPS berjalan; restore backup ke instance uji berhasil

---

## Phase 9 — Monetisasi: Trial, Langganan & Landing Page

Ditambahkan 2026-10-02 (keputusan user). Model: **harga per karyawan aktif per bulan**; **trial gratis 30 hari** untuk setiap usaha baru; pembayaran **QRIS statik merchant yang dibuat dinamis** (nominal disisipkan ke payload, pola `verssache/qris-dinamis`).

Prinsip phase ini:
- Harga, minimum karyawan ditagih, lama trial, dan masa tenggang adalah **data platform berlaku-tanggal** yang diubah super-admin — tidak hardcode. **Nilai awal: Rp10.000 per karyawan aktif per bulan, minimum ditagih 5 karyawan** (= tagihan minimum Rp50.000/bulan); bisa diubah kapan saja oleh super-admin — perubahan berlaku untuk tagihan yang dibuat setelah tanggal berlaku, tagihan yang sudah terbit tidak berubah
- Uang `numeric` + decimal.js; semua perubahan status langganan & konfirmasi pembayaran masuk audit log
- **QRIS dinamis tidak memberi notifikasi pembayaran** → konfirmasi lewat super-admin (nominal + kode unik dicocokkan dengan mutasi di aplikasi merchant). Dibangun di balik abstraksi `PaymentProvider` (implementasi `qris-manual`) agar gateway dengan webhook bisa dipasang nanti tanpa mengubah alur
- Data usaha **tidak pernah dihapus otomatis** karena belum bayar
- Tenant lama (sebelum phase ini, termasuk klien uji coba) → status **gratis (pilot)**; super-admin mengatur manual

### 39 Fondasi Langganan & Trial
**Logic:** tabel langganan per tenant — status `trialing` → `active` / `past_due` (masa tenggang) → `read_only`, plus `complimentary` (gratis/pilot, diatur super-admin); tanggal trial berakhir, periode berjalan. Harga platform berlaku-tanggal (harga per karyawan aktif, minimum karyawan ditagih, lama trial 30 hari, tenggang 7 hari). Signup owner → trial 30 hari otomatis; tenant buatan super-admin → pilih trial atau gratis. Migration: tenant lama → `complimentary`. Transisi status dihitung dari tanggal (tidak bergantung cron), dicatat saat berubah.
**Enforcement:** mode **baca-saja** di API (guard global) — semua mutasi ditolak 402 + kode error `SUBSCRIPTION_READ_ONLY`, kecuali auth, ganti password, billing, dan ekspor/unduh (laporan, slip). Berlaku juga untuk absen & log tugas karyawan (portal menampilkan "hubungi pemilik usaha"). Super-admin tidak terpengaruh.
- **Verifikasi:** test — signup → trialing 30 hari; tanggal digeser → past_due lalu read_only; mutasi ditolak 402, baca & ekspor tetap jalan; complimentary tidak pernah terkunci; isolasi tenant

### 40 Halaman Langganan & Pengingat Trial
**UI:** `/settings/billing` (owner saja) — status & sisa hari trial, estimasi tagihan bulan depan (karyawan aktif × harga, minimum), riwayat tagihan; banner di AppShell untuk owner/admin (trial H-7/H-3/H-1, masa tenggang, baca-saja) dengan tombol ke halaman billing
**Logic:** email pengingat ke owner via worker (H-7, H-3, H-1 trial berakhir; awal masa tenggang; masuk baca-saja), tanpa duplikat
- **Verifikasi:** angka estimasi = jumlah karyawan aktif di `/employees` × harga berlaku; banner & email muncul di hari yang tepat (tanggal digeser di test)

### 41 Tagihan & Pembayaran QRIS
**Logic:** tagihan bulanan dibuat worker di akhir trial / awal tiap periode: jumlah karyawan aktif (dihitung saat tagihan dibuat, snapshot rinciannya) × harga, min. minimum ditagih, + **kode unik 1–999 rupiah** agar mudah dicocokkan (unik di antara tagihan terbuka). QRIS dinamis dari payload QRIS statik merchant (env/pengaturan platform): tag 01 → `12`, sisip tag 54 nominal, hitung ulang CRC16 — dengan unit test terhadap payload contoh. Tagihan berlaku N hari; email tagihan ke owner
**UI:** di `/settings/billing` — detail tagihan + QR (bisa diunduh), nominal persis yang harus dibayar, tombol "Saya sudah bayar" (+ unggah bukti opsional, disimpan di storage) → status `menunggu konfirmasi` + **email pemberitahuan ke pemilik platform** (alamat dari env `BILLING_NOTIFY_EMAIL`, bisa lebih dari satu dipisah koma) berisi usaha, nomor tagihan, nominal persis, dan tautan ke `/admin/billing` — tanpa data karyawan
- **Verifikasi:** QR terbaca aplikasi e-wallet/m-banking dengan nominal benar (uji bayar nyata nominal kecil oleh user); nominal = rincian snapshot; tidak ada dua tagihan terbuka dengan nominal sama

### 42 Konfirmasi Pembayaran & Kelola Langganan (Super-admin)
**UI:** `/admin/billing` — antrean tagihan menunggu konfirmasi (nominal unik, usaha, bukti), konfirmasi / tolak dengan alasan; di `/admin/tenants/[id]` — status langganan, perpanjang trial, jadikan gratis/pilot, harga khusus per tenant; pengaturan harga platform (versi baru berlaku-tanggal)
**Logic:** konfirmasi → tagihan lunas → langganan `active` diperpanjang satu periode (dari akhir periode sebelumnya, atau dari hari ini jika sudah baca-saja) + email kuitansi ke owner; semua aksi masuk audit log. Super-admin tetap tidak melihat data karyawan/gaji (hanya jumlah karyawan aktif yang ditagih)
**Konfirmasi dari email (keputusan user 2026-10-02):** email "Pembayaran dilaporkan" ke `BILLING_NOTIFY_EMAIL` berisi tombol **Konfirmasi lunas** dan **Tolak** — pemilik platform cukup mencocokkan mutasi di aplikasi merchant lalu klik, tanpa login. Tautan = token acak sekali pakai per tagihan (hanya hash disimpan, kedaluwarsa, tidak berlaku lagi setelah tagihan diputuskan dari email maupun dashboard); membuka tautan **hanya menampilkan halaman konfirmasi** (rincian usaha, nomor, nominal persis) — aksi terjadi lewat tombol POST di halaman itu (GET tidak pernah mengubah data: pemindai tautan email & prefetch browser). Tolak dari email wajib alasan. Semua aksi tercatat di audit log dengan penanda sumber "email". `/admin/billing` tetap ada sebagai cadangan & riwayat
**Tanpa payment gateway (keputusan user 2026-10-02):** tidak ada integrasi gateway ber-webhook; abstraksi `PaymentProvider` tetap dipertahankan
- **Verifikasi:** alur ujung-ke-ujung trial → tagihan → bayar → konfirmasi → aktif; tenant baca-saja kembali normal seketika setelah konfirmasi; tolak → owner mendapat email + bisa ajukan ulang; konfirmasi lewat tautan email tanpa login berhasil, tautan dipakai ulang/kedaluwarsa/setelah diputuskan di dashboard ditolak, GET tautan tidak mengubah status

### 43 Landing Page Marketing
**UI:** `/` publik untuk tamu (pengguna login tetap diarahkan ke dashboard/portal) — hero + CTA "Coba gratis 30 hari" → `/signup`, masalah yang diselesaikan, fitur utama (payroll & PPh 21 TER, absensi, tugas harian → KPI, kepatuhan, portal karyawan), cara kerja, **harga per karyawan diambil dari data harga berlaku** (bukan hardcode) + kalkulator estimasi, FAQ, footer (kontak, kebijakan privasi, syarat layanan). **Wajib referensi desain** (Claude Design — prompt disusun saat feature dimulai)
**Logic:** halaman statis/ISR yang cepat; meta SEO, Open Graph, `sitemap.xml`, `robots.txt`; tanpa pelacak pihak ketiga kecuali disetujui user
- **Verifikasi:** visual desktop & mobile sesuai desain; Lighthouse performa & SEO ≥ 90; harga di landing = harga berlaku di database; CTA membuka signup dan trial langsung aktif
