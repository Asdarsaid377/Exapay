# Prompt Claude Design — Karyawan (daftar, tambah, detail)

_Disusun 2026-09-30 untuk feature 11. Salin seluruh isi di bawah garis ke Claude Design **di project/percakapan yang sama dengan desain glassmorphism sebelumnya** (agar token & komponen dipakai ulang), lalu kirim link hasilnya ke Claude Code (lihat `../ui-workflow.md` "Jalur Claude Design"). Prompt glassmorphism sebelumnya ada di riwayat git._

---

# Brief Desain UI — Exapay: Halaman Karyawan

## 1. Konteks
Lanjutan dari desain **Exapay tema Glassmorphism** yang sudah disetujui (Dashboard owner + Portal `/me` + Design token). **Pakai ulang persis** token, sidebar, header (tenant switcher + avatar), card kaca, tombol pill, input, badge, dan dropdown dari desain itu. Jangan membuat gaya baru kecuali untuk pola yang memang belum ada (tabel data, form panjang, halaman detail bertab).

Exapay: SaaS HR & payroll untuk **UMKM Indonesia, karyawan < 50 orang**, tanpa staf HR. Semua teks **Bahasa Indonesia**. Tanggal `30 Sep 2026`.

Ringkasan token (dari desain sebelumnya): aksen oranye `#F2790F` (hover `#D9600A`, teks aksen `#B34C08`), latar krem `#FBF8F3` dengan bentuk warna flat lembut, teks `#221208` / `#5B4636` / `#8A7561`, status sukses `#15803D`, peringatan `#D97706`, bahaya `#DC2626`, info `#2563EB`. Font Plus Jakarta Sans (judul) + DM Sans (teks). Card kaca radius 22px, field 14px, tombol pill; teks tombol primer `#221208`.

## 2. Peran yang melihat halaman ini
- **Pemilik & Admin:** melihat semua karyawan, menambah, mengubah, menonaktifkan; boleh membuka data sensitif (NIK, NPWP, rekening) lewat tombol "Tampilkan" (tercatat di log audit).
- **Atasan:** hanya melihat **bawahan langsungnya**, **hanya baca** (tanpa tombol tambah/ubah/nonaktifkan), dan data sensitif **tidak ditampilkan sama sekali** (bagian tersebut tidak muncul).

## 3. Batasan (WAJIB — preferensi user)
- Tanpa gradient warna-warni, tanpa glow/pendar. Blur hanya untuk panel kaca.
- **Tanpa badge/pill ber-titik (dot)**, tanpa eyebrow label warna-warni.
- **Tanpa ikon hiasan dalam kotak/lingkaran per baris.** Ikon hanya untuk navigasi, aksi, atau status. Avatar inisial nama boleh (sudah ada di desain sebelumnya).
- Maksimal 2 level radius bersarang. Satu font weight per elemen.
- Kontras teks di atas kaca WCAG AA. Data penting di permukaan paling solid.

## 4. Yang Didesain Sekarang (3 halaman, desktop 1440px + versi mobile 390px masing-masing)

Usaha **Kopi Nusantara** (Kota Makassar), pengguna **Budi Santoso** (Pemilik). Menu sidebar **Karyawan** aktif.

### Halaman 1 — Daftar Karyawan `/employees`
- Judul "Karyawan" + sub-judul "18 aktif · 2 nonaktif". Aksi kanan: tombol primer **"Tambah karyawan"** dan tombol sekunder **"Impor Excel"** (hanya pemilik/admin).
- Baris filter: kotak cari (nama / nomor induk), select Departemen, select Status kerja (Tetap / Kontrak / Percobaan), toggle/segmented **Aktif | Nonaktif | Semua** (default Aktif).
- **Tabel** (desktop) dengan kolom: Nama (avatar inisial + nama, di bawahnya nomor induk `KN-0012` kecil), Jabatan · Departemen, Status kerja (badge: Tetap / Kontrak / Percobaan), Atasan langsung, Tanggal masuk, Keterangan kontrak (mis. "Kontrak habis 12 Okt 2026" berwarna peringatan jika ≤ 30 hari; "Percobaan selesai 5 Okt 2026"). Baris bisa diklik ke detail. Karyawan nonaktif: badge "Nonaktif" + teks lebih redup.
- Data contoh (±8 baris terlihat):
  - Dewi Lestari — Barista · Operasional — Tetap — atasan Rudi Hartono — masuk 3 Feb 2024
  - Rina Wulandari — Kasir · Operasional — Kontrak, habis 12 Okt 2026 — atasan Rudi Hartono
  - Agus Pratama — Barista · Operasional — Percobaan, selesai 5 Okt 2026 — atasan Rudi Hartono
  - Rudi Hartono — Kepala Toko · Operasional — Tetap — atasan: Budi Santoso
  - Siti Rahmawati — Staf Keuangan · Keuangan — Tetap
  - Fajar Nugroho — Kurir · Logistik — Kontrak, habis 20 Jan 2027
  - Maya Sari — Barista · Operasional — Tetap
  - Hendra Wijaya — Roaster · Produksi — Tetap
- **Mobile:** tabel berubah menjadi daftar card ringkas (nama, jabatan, badge status, keterangan kontrak).
- Pagination sederhana di bawah (20 per halaman).
- State: **empty state** tanpa karyawan sama sekali ("Belum ada karyawan" + tombol Tambah karyawan & Impor Excel), empty state hasil filter kosong ("Tidak ada karyawan yang cocok" + tautan reset filter), **skeleton** baris tabel.
- Varian **tampilan atasan** (frame kecil): judul "Bawahan saya", tanpa tombol Tambah/Impor, hanya 3 baris.

### Halaman 2 — Tambah Karyawan `/employees/new`
Form panjang, satu halaman, dibagi **section** (card kaca; tiap section 2 kolom di desktop: kiri judul + penjelasan singkat, kanan field — mengikuti pola form pengaturan). Tautan "← Karyawan" di atas judul "Tambah karyawan". Tombol **Simpan** (primer) + **Batal** di bawah (sticky bar di bawah pada mobile boleh).

1. **Identitas** — Nama lengkap*, Nomor induk karyawan (opsional, mis. KN-0019), Email (untuk undangan portal, opsional), No. HP, Tanggal lahir, Jenis kelamin.
2. **Pekerjaan** — Departemen* (select), Jabatan* (select), Atasan langsung (select berisi karyawan lain, bisa kosong), Tanggal masuk*, Status kerja* (segmented: Tetap / Kontrak / Percobaan). Jika Kontrak → field **Tanggal akhir kontrak***; jika Percobaan → **Tanggal akhir percobaan***. Tunjukkan kedua kondisi.
3. **Pajak & identitas resmi** — NIK (16 digit), NPWP (15/16 digit, opsional — keterangan "NPWP 16 digit = NIK untuk WP orang pribadi"), Status PTKP* (select: TK/0, TK/1, TK/2, TK/3, K/0, K/1, K/2, K/3). Catatan kecil dengan ikon gembok: "Disimpan terenkripsi. Ditampilkan tersamar."
4. **Rekening bank** — Nama bank (select/combobox bank Indonesia: BCA, BRI, Mandiri, BNI, BSI, …), Nomor rekening, Nama pemilik rekening. Catatan gembok yang sama.
5. **Akun portal** (opsional) — info singkat: "Karyawan bisa masuk ke portal untuk absen & mencatat tugas." Select "Tautkan ke akun pengguna" (daftar anggota usaha yang belum tertaut) — atau teks "Undang lewat menu Pengguna".

State: error validasi per field (mis. "NIK harus 16 digit"), error form di atas (mis. "Gagal menyimpan — coba lagi"), tombol Simpan loading.

### Halaman 3 — Detail Karyawan `/employees/[id]` (tab Data)
- Header halaman: tautan "← Karyawan", avatar inisial besar + **Dewi Lestari**, di bawahnya "Barista · Operasional · KN-0012", badge status kerja + badge Aktif/Nonaktif. Aksi kanan (pemilik/admin): tombol **Ubah** dan menu "⋯" berisi **Nonaktifkan karyawan**.
- **Tab:** Data (aktif), Gaji, KPI, Absensi — tab selain Data tampil tapi berisi "Segera hadir" (belum dibangun).
- **Tab Data** — tampilan baca (read-only) dalam card per section yang sama dengan form: Identitas, Pekerjaan (termasuk atasan langsung sebagai tautan, tanggal masuk, masa kerja "2 tahun 7 bulan", status + tanggal akhir kontrak/percobaan), Pajak & identitas resmi, Rekening bank, Akun portal ("Tertaut: dewi@kopinusantara.id" atau "Belum tertaut").
- **Data sensitif termasking:** NIK `7371 •••• •••• 0004`, NPWP `•• ••• ••• •-•••.000`, rekening `BCA •••• •••• 4821`. Di samping tiap section sensitif tombol kecil **"Tampilkan"** (ikon mata) → nilai penuh terlihat + teks kecil "Tercatat di log audit". Tunjukkan state tersamar dan terbuka.
- **Mode Ubah:** tombol Ubah mengubah halaman menjadi form yang sama dengan Halaman 2 (terisi). Field sensitif pada mode ubah kosong dengan placeholder tersamar + keterangan "Kosongkan jika tidak diubah".
- **Dialog Nonaktifkan:** judul "Nonaktifkan Dewi Lestari?", field **Tanggal keluar***, textarea Alasan (opsional), tombol bahaya "Nonaktifkan" + Batal. Karyawan nonaktif menampilkan banner "Nonaktif sejak 30 Sep 2026" dan aksi **Aktifkan kembali**.
- **Tampilan atasan:** tanpa tombol Ubah/menu, tanpa section Pajak & Rekening.

## 5. Output yang Diharapkan
1. Tiga halaman di atas, desktop 1440px + mobile 390px, high fidelity, data contoh realistis, beserta state yang disebut (empty, skeleton, error validasi, masked/terbuka, dialog, tampilan atasan).
2. **Komponen baru beserta variannya** (nama berdasarkan peran, bisa dipetakan ke Tailwind v4 `@theme` yang sudah ada): tabel data kaca (header, baris hover, baris redup), filter bar, segmented control, tab bar, section form 2 kolom, field tampilan baca (label + nilai), nilai termasking + tombol Tampilkan, banner status, sticky action bar mobile.
3. Pakai ulang token yang sudah ada; jika butuh token baru, sebutkan eksplisit.
4. Semua bisa diimplementasikan dengan CSS standar + Tailwind v4.
