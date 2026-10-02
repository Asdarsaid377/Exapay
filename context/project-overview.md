# Project Overview — Exapay

> Nama produk sementara: **Exapay**. Sumber: `PROJECT_BRIEF.md` + hasil wawancara `/plan-app` (2026-09-29). Jika ada konflik, keputusan di file ini lebih baru daripada brief.

---

## Tentang Project

Exapay adalah aplikasi SaaS multi-tenant yang **membantu tugas HRD** di UMKM dengan karyawan di bawah 50 orang yang belum punya orang HR. Exapay bukan pengganti HRD: sistem menghitung, memandu, dan mengingatkan, tetapi keputusan akhir tetap di tangan owner atau atasan.

Pengguna: **owner** (pengambil keputusan, sering merangkap admin), **admin** (mengelola data dan payroll), **atasan** (memverifikasi tugas, menilai kinerja), **karyawan** (absen, mencatat pekerjaan, melihat slip — kebanyakan lewat HP), dan **super-admin** (pemilik platform, mengelola tenant).

Value inti: owner memasukkan karyawan dan aturan sekali, lalu setiap periode mendapat gaji yang sudah dihitung sesuai aturan, skor kinerja karyawan yang bisa dijelaskan, dan pengingat sebelum tenggat BPJS/pajak.

---

## Masalah yang Diselesaikan

- Gaji, BPJS, dan PPh 21 dihitung manual di Excel — rawan salah, dan aturannya sering berubah
- Koordinasi tugas lewat WhatsApp — tidak ada data objektif siapa yang kinerjanya bagus
- Absensi dicatat manual — potongan gaji tidak konsisten dan sulit dijelaskan ke karyawan
- Tenggat setor BPJS/PPh 21, kontrak habis, dan masa percobaan sering terlupa

Pembeda dari kompetitor (Mekari Talenta, Gadjian, dll): modul **tugas harian → KPI** yang sederhana untuk UMKM, dengan skor yang bisa dijelaskan dan ringkasan kinerja berbantuan AI yang selalu direview atasan.

---

## Halaman (Pages)

```
Publik
/                           → Landing page marketing untuk tamu (Phase 9); pengguna login diarahkan sesuai peran
/login                      → Login
/signup                     → Registrasi owner + buat tenant
/verify-email               → Verifikasi email
/forgot-password            → Minta reset password
/reset-password             → Set password baru
/invite/[token]             → Terima undangan, set password

Owner / Admin / Atasan (sidebar)
/dashboard                  → Ringkasan sesuai peran
/employees                  → Daftar karyawan
/employees/new              → Tambah karyawan
/employees/[id]             → Detail & edit karyawan (data, gaji, KPI, absensi)
/employees/import           → Impor Excel
/organization               → Departemen & jabatan
/attendance                 → Rekap absensi per periode
/attendance/requests        → Pengajuan izin/sakit/cuti (persetujuan)
/attendance/corrections     → Koreksi absensi (admin)
/kpi/templates              → Template KPI per jabatan
/kpi/verification           → Verifikasi log tugas bawahan (atasan)
/kpi/scores                 → Lihat skor ad-hoc (rentang bebas)
/kpi/reviews                → Daftar penilaian periodik
/kpi/reviews/[id]           → Detail penilaian + ringkasan AI + review/finalisasi
/payroll                    → Daftar periode payroll
/payroll/[id]               → Draf/review/final payroll satu periode
/payroll/[id]/slips         → Slip gaji periode (PDF)
/payroll/reports            → Laporan & ekspor Excel
/compliance                 → Kalender kepatuhan
/settings/company           → Profil usaha, kota (UMK), tanggal gajian
/settings/users             → Pengguna & undangan, peran
/settings/salary-components → Komponen gaji
/settings/attendance        → Jadwal kerja, hari libur, aturan potongan absensi
/settings/kpi               → Siklus penilaian
/settings/billing           → Langganan: status trial, estimasi tagihan, tagihan & QRIS, riwayat (owner, Phase 9)

Karyawan (PWA, bottom nav)
/me                         → Beranda: absen masuk/pulang, tugas hari ini
/me/tasks                   → Log tugas harian
/me/attendance              → Riwayat absensi + ajukan izin/sakit/cuti
/me/payslips                → Slip gaji
/me/performance             → Skor & penilaian sendiri
/me/profile                 → Profil

Super-admin
/admin/tenants              → Daftar tenant, buat tenant + owner, nonaktifkan
/admin/tenants/[id]         → Detail tenant (statistik dasar, tanpa data gaji/karyawan) + kelola langganan (Phase 9)
/admin/billing              → Konfirmasi pembayaran & harga platform (Phase 9)
```

Daftar route bersifat acuan; detail diputuskan per feature sesuai desain.

---

## Navigasi

- **Owner/admin/atasan (desktop-first):** sidebar kiri — Dashboard, Karyawan, Organisasi, Absensi, KPI, Payroll, Kepatuhan, Pengaturan. Item disembunyikan sesuai peran (atasan tidak melihat Payroll & Pengaturan). Di mobile sidebar menjadi drawer.
- **Karyawan (mobile-first, PWA):** bottom navigation — Beranda, Tugas, Absensi, Slip, Profil.
- **Super-admin:** area terpisah `/admin` dengan navigasi sendiri.
- User yang tergabung di lebih dari satu tenant memilih tenant aktif (switcher di header).

---

## Alur User Inti (Core User Flow)

**Onboarding & auth**
1. Owner membuka landing page → "Coba gratis 30 hari" → daftar di `/signup` (atau dibuatkan super-admin) → verifikasi email → tenant dibuat (trial 30 hari aktif) dengan default: aturan BPJS & TER berlaku, jadwal kerja default, template KPI & komponen gaji bawaan
2. Owner melengkapi profil usaha → menambah/impor karyawan → mengundang admin, atasan, karyawan via email
3. Undangan diterima di `/invite/[token]` → set password → masuk
4. Redirect: belum login → `/login`; karyawan → `/me`; owner/admin/atasan → `/dashboard`; super-admin → `/admin/tenants`

**Harian**
- Karyawan: buka `/me` → absen masuk → catat realisasi indikator tugas (angka, catatan, foto opsional) → absen pulang
- Atasan: `/kpi/verification` → setujui/tolak/koreksi log tugas; setujui pengajuan izin/cuti
- Owner/atasan: `/kpi/scores` → pantau skor untuk rentang bebas

**Akhir periode KPI**
- Sistem membuat penilaian periodik (default bulanan) → skor dihitung dengan rumus → atasan mengisi nilai indikator penilaian → AI membuat draf narasi → atasan review & edit → final (terkunci)

**Akhir periode payroll**
- Admin membuka periode → sistem menyusun draf: komponen gaji + potongan absensi otomatis (dengan penjelasan) + BPJS + PPh 21 TER (+ true-up Desember) → admin menyesuaikan (THR/pendapatan tidak tetap diinput manual) → owner/admin finalisasi (snapshot immutable + audit log) → slip PDF dibuat lewat antrean & dikirim email → karyawan melihat di `/me/payslips` → ekspor Excel untuk transfer bank dan setor

**Langganan (Phase 9)**
- Trial 30 hari → pengingat H-7/H-3/H-1 → tagihan dibuat (karyawan aktif × harga + kode unik) → owner bayar via QRIS di `/settings/billing` → "Saya sudah bayar" → super-admin konfirmasi → aktif satu periode. Tidak dibayar → tenggang 7 hari → baca-saja sampai lunas

**Kepatuhan**
- Dashboard & email H-7 / H-1: setor BPJS, setor/lapor PPh 21, kontrak habis, masa percobaan selesai, gaji pokok di bawah UMK

---

## Fitur Utama

### MVP

1. **Akun, tenant & akses** — self-signup owner + verifikasi email; panel super-admin (buat/nonaktifkan tenant, statistik dasar, tanpa akses data gaji/karyawan); undang pengguna; login/logout/lupa password; RBAC owner/admin/atasan/karyawan (atasan hanya melihat bawahan langsung); multi-tenant per user
2. **Master data** — profil usaha (NPWP badan, kota untuk UMK, tanggal gajian); departemen & jabatan; karyawan (NIK/NPWP/rekening terenkripsi & termasking, PTKP, status tetap/kontrak/percobaan, tanggal akhir kontrak/percobaan, atasan langsung); impor Excel dengan validasi & pratinjau
3. **Absensi** — masuk/pulang dari HP (waktu server, GPS dicatat tidak memblokir); jadwal kerja default per tenant + hari libur; pengajuan izin/sakit/cuti + persetujuan atasan; koreksi admin (audit log); rekap periode; **aturan potongan terstruktur per tenant, berversi dengan tanggal berlaku**:
   - Tidak hadir tanpa izin: tidak dipotong / prorata (gaji pokok [+ tunjangan tetap]) ÷ hari kerja × hari alpa / nominal tetap per hari
   - Pembagi hari kerja: hari kerja aktual / angka tetap
   - Telat: tidak dipotong / per kejadian / per blok menit; toleransi N menit; batas maksimal per bulan
   - Izin/sakit: tidak dipotong / dipotong jika tanpa surat / dipotong setelah N hari
   - Tunjangan kehadiran: tidak ada / hangus jika alpa ≥ N / berkurang per hari alpa
4. **Tugas harian & KPI** — template KPI per jabatan (indikator, bobot, target dengan satuan waktu, tipe: angka/jumlah/penilaian atasan/otomatis sistem) + 3–5 template bawaan; log harian oleh karyawan; verifikasi atasan (hanya entri terverifikasi dihitung); skor ad-hoc untuk rentang bebas (target diprorata per hari kerja; indikator penilaian hanya tampil jika sudah dinilai)
   - Skor: capaian = realisasi ÷ target (maks 120%); skor = Σ capaian × bobot (0–100); predikat ≥90 Sangat Baik, 75–89 Baik, 60–74 Cukup, <60 Perlu Perbaikan
5. **Penilaian periodik & ringkasan AI** — siklus per tenant (mingguan/bulanan/triwulanan, default bulanan, tidak tumpang-tindih); skor final dari rumus; AI (Claude, di balik lapisan abstraksi, kuota per tenant) hanya menulis narasi; simpan input, output, versi prompt; status draft → direview → final
6. **Payroll** — komponen gaji (template bawaan; THR sebagai pendapatan tidak tetap manual); BPJS Kesehatan & Ketenagakerjaan (JHT, JP, JKK, JKM) dengan batas upah; PPh 21 TER bulanan + true-up Desember; potongan absensi otomatis dengan penjelasan; draf → review → final (snapshot immutable + audit log); slip PDF via antrean + email; laporan & ekspor Excel
7. **Kalender kepatuhan** — pengingat setor BPJS, setor/lapor PPh 21, kontrak habis, masa percobaan selesai; dashboard + email H-7/H-1; data UMK per kota + peringatan gaji di bawah UMK
8. **Dashboard & portal karyawan** — dashboard owner/admin & atasan; portal karyawan PWA (absen, log tugas, izin, slip, skor)

### Phase 9 — Monetisasi (ditambahkan 2026-10-02)

9. **Trial & langganan** — trial gratis 30 hari untuk setiap usaha baru (self-signup); harga per karyawan aktif per bulan (data berlaku-tanggal, diubah super-admin); trial/tagihan tidak dibayar → tenggang 7 hari → mode baca-saja (data tetap aman, ekspor tetap bisa); tenant lama = gratis (pilot)
10. **Tagihan & pembayaran QRIS** — tagihan bulanan otomatis (jumlah karyawan aktif × harga + kode unik), QRIS dinamis dari QRIS statik merchant, owner menandai sudah bayar, super-admin mengonfirmasi; email pengingat, tagihan & kuitansi
11. **Landing page marketing** — halaman publik `/` untuk tamu: fitur, harga dari data, kalkulator estimasi, FAQ, CTA coba gratis 30 hari

### Phase 10 — Absensi Lanjutan (ditambahkan 2026-10-02)

12. **Geofence peringatan** — lokasi kerja per usaha (radius), status lokasi tiap absen (di luar lokasi / tidak akurat / tanpa lokasi) **hanya sebagai tanda** untuk antrean tinjauan admin — absen tetap diterima, gaji tidak berubah otomatis
13. **Selfie absen** — wajib per karyawan (default aktif, bisa dimatikan owner/admin), foto sebagai bukti (tanpa pengenalan wajah), disimpan 90 hari
14. **Shift & roster harian** — master shift; karyawan mode "ikut jadwal usaha" (default) atau "shift"; roster per tanggal (satu shift per tanggal, bisa berubah kapan saja untuk hari ini & ke depan) diatur owner/admin & atasan (bawahan langsung); absen, telat, alpa, potongan & prorata KPI mengikuti roster

### Fase Berikutnya

- Aplikasi mobile native (iOS/Android) — API dirancang agar bisa dipakai client mobile
- Lembur
- Kalkulator THR otomatis
- Notifikasi WhatsApp — uji coba via gateway self-hosted (WAHA/Evolution API), tanpa data sensitif di isi pesan
- Adapter ERPNext & ekspor ke sistem akuntansi lain
- Saldo cuti tahunan otomatis
- Rekrutmen
- Asisten AI tanya-jawab hukum ketenagakerjaan
- Template dokumen HR (kontrak, SP, surat keterangan)
- Onboarding/offboarding penuh
- Earned wage access / kasbon
- Pelaporan pajak otomatis (e-Bupot)
- Kalkulator pesangon (sebagai kalkulator referensi dengan disclaimer)

---

## Di Luar Scope (Out of Scope)

- Regulasi di luar Indonesia & multi-mata uang
- Eksekusi transfer gaji ke bank (hanya ekspor file untuk transfer)
- Rekomendasi keputusan SP/PHK — sistem hanya kalkulator & referensi, tidak memutuskan
- Skor AI yang langsung memengaruhi gaji/bonus tanpa review manusia
- Penggunaan Frappe/ERPNext sebagai engine
- Bahasa UI selain Indonesia (untuk versi ini)
