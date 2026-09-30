# Prompt Claude Design — Redesign Glassmorphism (2 halaman preview)

_Disusun 2026-09-30 setelah feature 06. Salin seluruh isi di bawah garis ke Claude Design, lalu kirim link hasilnya ke Claude Code (lihat `../ui-workflow.md` "Jalur Claude Design")._

---

# Brief Desain UI — Exapay (Redesign, Tema Glassmorphism)

## 1. Tentang Produk
Exapay adalah aplikasi SaaS web (multi-tenant) untuk **UMKM di Indonesia dengan karyawan di bawah 50 orang** yang belum punya staf HR. Exapay membantu tugas HRD, bukan menggantikannya: sistem menghitung, memandu, dan mengingatkan, tetapi keputusan akhir tetap di tangan pemilik usaha atau atasan.

Value inti: pemilik usaha memasukkan data karyawan dan aturan satu kali. Setiap periode ia mendapat gaji yang sudah dihitung sesuai aturan (BPJS, PPh 21), skor kinerja karyawan yang bisa dijelaskan, dan pengingat sebelum tenggat BPJS/pajak.

Pembeda dari kompetitor (Mekari Talenta, Gadjian): modul **tugas harian → skor KPI** yang sederhana untuk UMKM, ditambah ringkasan kinerja berbantuan AI yang selalu direview atasan.

Semua teks UI dalam **Bahasa Indonesia**. Mata uang Rupiah dengan format `Rp 4.850.000`. Tanggal dengan format `30 Sep 2026` atau `Senin, 30 September 2026`.

## 2. Pengguna & Peran
| Peran | Siapa | Perangkat utama | Area |
|---|---|---|---|
| Pemilik (owner) | Pemilik usaha, sering merangkap admin | Laptop & HP | Sidebar (semua menu) |
| Admin | Mengelola data karyawan & payroll | Laptop | Sidebar (semua menu) |
| Atasan | Memverifikasi tugas bawahan, menilai kinerja | Laptop & HP | Sidebar (tanpa Payroll & Pengaturan) |
| Karyawan | Absen, mencatat tugas, melihat slip | **HP (Android kelas menengah ke bawah)** | Portal `/me`, bottom nav |
| Super-admin | Pemilik platform Exapay | Laptop | Area `/admin` terpisah |

Satu akun bisa tergabung di beberapa usaha (tenant), sehingga perlu **tenant switcher** di header.

## 3. Semua Fitur (konteks — agar gaya desain cocok untuk seluruh aplikasi)
1. **Akun & akses:** daftar pemilik usaha + verifikasi email, login, lupa password, undang pengguna via email, kelola peran, pindah usaha.
2. **Master data:** profil usaha (NPWP, kota untuk UMK, tanggal gajian), departemen & jabatan, data karyawan (NIK/NPWP/rekening tampil termasking, status tetap/kontrak/percobaan, tanggal akhir kontrak, PTKP, atasan langsung), impor karyawan dari Excel dengan pratinjau error per baris.
3. **Absensi:** absen masuk/pulang dari HP (waktu server, GPS dicatat), jadwal kerja & hari libur, pengajuan izin/sakit/cuti + persetujuan atasan, koreksi oleh admin, rekap per periode (hadir, telat menit, alpa, izin, sakit, cuti), aturan potongan absensi per usaha.
4. **Tugas harian & KPI:** template KPI per jabatan (indikator, bobot total 100%, target), karyawan mencatat realisasi harian (angka, catatan, foto), atasan menyetujui/menolak/mengoreksi, skor untuk rentang tanggal bebas. Rumus: capaian = realisasi ÷ target (maks 120%), skor 0–100. Predikat: ≥90 Sangat Baik, 75–89 Baik, 60–74 Cukup, <60 Perlu Perbaikan.
5. **Penilaian periodik + AI:** siklus bulanan/mingguan/triwulanan, status draft → direview → final (terkunci). AI menulis draf narasi kinerja yang wajib direview dan diedit atasan.
6. **Payroll:** komponen gaji, BPJS Kesehatan & Ketenagakerjaan (JHT, JP, JKK, JKM), PPh 21 metode TER + penyesuaian Desember, potongan absensi otomatis beserta penjelasannya, alur draf → review → final, slip gaji PDF via email, laporan & ekspor Excel.
7. **Kepatuhan:** kalender pengingat (setor BPJS, setor/lapor PPh 21, kontrak habis, masa percobaan selesai), peringatan gaji pokok di bawah UMK.
8. **Dashboard & portal karyawan** (PWA, bisa di-install di HP).

## 4. Peta Halaman (sitemap lengkap — untuk konteks navigasi)
**Publik:** `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`, `/invite/[token]`

**Owner/Admin/Atasan (sidebar):**
- Dashboard `/dashboard`
- Karyawan `/employees` (+ tambah, detail dengan tab Data/Gaji/KPI/Absensi, impor Excel)
- Organisasi `/organization`
- Absensi → Rekap, Pengajuan izin, Koreksi
- KPI → Verifikasi tugas, Skor, Penilaian, Template KPI
- Payroll → Periode gaji (draf/review/final, slip), Laporan
- Kepatuhan `/compliance`
- Pengaturan → Profil usaha, Pengguna, Komponen gaji, Absensi, Siklus KPI

**Karyawan (bottom nav):** Beranda `/me`, Tugas, Absensi, Slip, Profil (+ Kinerja saya)

**Super-admin:** Daftar tenant, Detail tenant

## 5. Arah Visual — Glassmorphism
- **Nuansa:** tenang, hangat, profesional, dan dipercaya untuk urusan uang. Premium tapi tidak "futuristik". Target pengguna adalah pemilik warung kopi, toko bangunan, dan konveksi, bukan startup teknologi.
- **Warna brand (pertahankan):**
  - Aksen oranye `#F2790F` (hover `#D9600A`; teks/tautan beraksen `#B34C08`)
  - Krem `#FBF8F3`
  - Teks cokelat tua `#221208` / `#5B4636` / muted `#8A7561`
  - Status: sukses `#15803D`, peringatan `#D97706`, bahaya `#DC2626`, info `#2563EB`
- **Font:** Plus Jakarta Sans (judul, 700–800, tracking rapat) + DM Sans (teks).
- **Lapisan kaca:**
  - Panel putih/krem semi-transparan (±55–75% opasitas) dengan backdrop blur ±16–24px.
  - Border tipis putih semi-transparan (1px) dan bayangan lembut bernuansa cokelat hangat.
  - Radius card ±22px, radius field ±14px, tombol berbentuk pill.
- **Latar di belakang kaca:** **foto nyata** (orang bekerja di UMKM Indonesia: kafe, toko, workshop) dengan lapisan warna hangat, ATAU bentuk warna flat yang lembut (krem, peach, oranye muda) dengan tepi jelas.
- **Keterbacaan:** kontras teks di atas kaca harus memenuhi WCAG AA (≥4.5:1 untuk teks normal). Angka uang dan data penting ditaruh di permukaan paling solid.

## 6. Batasan (WAJIB — preferensi user)
- **Tanpa gradient warna-warni / mesh gradient neon, tanpa efek glow/pendar.** Blur hanya dipakai sebagai efek kaca panel.
- **Tanpa badge/pill ber-titik (dot)** di depan teks, tanpa eyebrow label warna-warni.
- **Tanpa deretan ikon dalam kotak/lingkaran sebagai hiasan** per baris daftar. Ikon hanya boleh bila fungsional: navigasi, aksi, atau status.
- Maksimal 2 level radius bersarang. Satu font weight per elemen.
- Portal karyawan harus tetap ringan di HP murah: kurangi jumlah lapisan blur (mis. hanya header, bottom nav, dan 1 card utama) dan sediakan tampilan solid sebagai fallback.

## 7. Yang Didesain Sekarang: 2 Halaman Preview

### Halaman 1 — Dashboard Owner (desktop 1440px)
Konteks: pemilik usaha "Budi Santoso", usaha **Kopi Nusantara**, 18 karyawan aktif, hari Senin 30 September 2026.

- **Sidebar kiri (panel kaca):**
  - Logo Exapay di atas.
  - Menu dengan ikon: Dashboard (aktif), Karyawan, Organisasi, Absensi, KPI, Payroll, Kepatuhan, Pengaturan.
  - Grup memiliki sub-menu yang terbuka saat grup aktif.
- **Header:**
  - Tenant switcher: nama usaha + peran "Pemilik" + chevron. Dropdown berisi daftar usaha lain.
  - Avatar inisial "BS" di kanan, dengan dropdown berisi nama, email, dan tombol Keluar.
- **Konten:**
  - Sapaan "Selamat pagi, Budi" + ringkasan singkat periode September 2026.
  - 4 angka ringkas:
    - Biaya gaji bulan ini Rp 68.450.000 (draf)
    - Karyawan aktif 18
    - Kehadiran hari ini 16/18
    - Rata-rata skor KPI 82 (Baik)
  - Grafik rekap kehadiran 30 hari: hadir / telat / izin / alpa.
  - Sebaran predikat skor KPI: Sangat Baik 4, Baik 9, Cukup 4, Perlu Perbaikan 1.
  - **Tindakan tertunda:** 7 log tugas menunggu verifikasi, 2 pengajuan izin menunggu persetujuan, payroll September masih draf (tombol "Review payroll").
  - **Pengingat kepatuhan:**
    - Setor BPJS — 10 Okt 2026 (H-10)
    - Setor PPh 21 — 15 Okt 2026
    - Kontrak "Rina Wulandari" habis 12 Okt 2026
    - Masa percobaan "Agus Pratama" selesai 5 Okt 2026
  - Peringatan: 1 karyawan bergaji pokok di bawah UMK Kota Makassar.
- Tampilkan juga versi **tablet/mobile** dashboard (sidebar menjadi drawer) sebagai frame kecil jika memungkinkan.

### Halaman 2 — Beranda Portal Karyawan `/me` (mobile 390px)
Konteks: karyawan "Dewi Lestari", jabatan Barista, di Kopi Nusantara.

- **Header ringkas (kaca):** nama usaha + avatar "DL".
- **Kartu absen (elemen utama):**
  - Jam server besar "07:52", tanggal, jadwal "08:00–17:00".
  - Tombol besar **"Absen Masuk"**. Tampilkan juga status sesudahnya: "Masuk 07:52 · Tepat waktu" dan tombol "Absen Pulang".
  - Catatan kecil "Lokasi dicatat".
- **Tugas hari ini:** 3 indikator dari template jabatan dengan realisasi/target dan progres:
  - Jumlah cup terjual 86/120
  - Kebersihan area bar — dinilai atasan
  - Stok bahan dicek 1/1
  - Tombol "Catat tugas". Status entri: menunggu verifikasi / disetujui / ditolak.
- **Ringkasan singkat:**
  - Skor bulan ini 88 (Baik)
  - Kehadiran bulan ini: 20 hadir, 1 telat, 0 alpa
  - Slip gaji terakhir "Agustus 2026" (nominal tersembunyi, tap untuk lihat)
- **Bottom navigation (kaca):** Beranda (aktif), Tugas, Absensi, Slip, Profil.
- Area sentuh minimal 44px; semua bisa dioperasikan dengan satu tangan.

## 8. State yang Perlu Ditunjukkan
Di kedua halaman, tunjukkan minimal:
- Hover/aktif pada menu dan tombol.
- Satu contoh **empty state** (mis. "Belum ada tindakan tertunda").
- **Skeleton loading** untuk card.

## 9. Output yang Diharapkan
1. Dua halaman di atas (desktop + mobile), high fidelity, dengan data contoh yang realistis.
2. **Daftar design token:**
   - Warna, termasuk nilai opasitas kaca.
   - Nilai blur, border, shadow, radius, spacing, dan skala tipografi.
   - Diberi nama berdasarkan peran (mis. `surface-glass`, `border-glass`, `text-primary`), agar bisa dipetakan ke Tailwind CSS v4 (`@theme`).
3. **Komponen dasar yang terlihat beserta variannya:**
   - Button primary/secondary
   - Input
   - Card kaca (tingkat blur/opasitas berbeda untuk panel utama vs sekunder)
   - Item sidebar
   - Bottom nav item
   - Stat tile
   - Badge status (menunggu / disetujui / ditolak / terlambat)
   - Dropdown
4. Semua harus bisa diimplementasikan dengan CSS standar (`backdrop-filter`) + Tailwind v4. Jangan memakai efek yang hanya bisa dibuat sebagai gambar statis.
