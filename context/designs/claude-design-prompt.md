# Prompt Claude Design — Master Shift & Roster

_Disusun 2026-10-03 untuk feature 46 (plus tampilan kecil feature 47). Salin seluruh isi di bawah garis ke Claude Design **di project/percakapan yang sama dengan desain glassmorphism, geofence & selfie sebelumnya** (agar token & komponen dipakai ulang), lalu export zip ke `context/designs/` (atau kirim link) ke Claude Code. Prompt sebelumnya (selfie absen, feature 45) ada di riwayat git._

---

# Brief Desain UI — Exapay: Master Shift & Roster

## 1. Konteks
Lanjutan dari desain **Exapay tema Glassmorphism** yang sudah disetujui (Dashboard, Portal `/me`, Karyawan, Lokasi Kerja & Tinjauan Absensi, Selfie Absen). **Pakai ulang persis** token, sidebar, header, card kaca, tombol pill, input, select, badge, segmented control, data-table kaca, form-section 2 kolom, read-field, banner, dialog/sheet, dropdown, **section "Pengaturan absen"** (sudah berisi Lokasi absen & Wajib selfie), **kartu absen portal**, dan **rincian absensi (tabel Tanggal | Masuk | Pulang | Status)**. Gaya baru hanya untuk pola yang belum ada (lihat bagian 5).

Exapay: SaaS yang membantu tugas HRD di **UMKM Indonesia, karyawan < 50 orang**, tanpa staf HR. Semua teks **Bahasa Indonesia**, nada lugas untuk pemilik usaha. Tanggal contoh **Senin 5 Okt 2026**, zona waktu **WITA**.

Ringkasan token: aksen oranye `#F2790F` (hover `#D9600A`, teks aksen `#B34C08`), latar krem `#FBF8F3` dengan bentuk warna flat lembut, teks `#221208` / `#5B4636` / `#8A7561`, sukses `#15803D`, peringatan `#D97706`, bahaya `#DC2626`, info `#2563EB`. Font Plus Jakarta Sans (judul) + DM Sans (teks). Card kaca radius 22px, field 14px, tombol pill; **teks tombol primer `#221208`** (bukan putih).

## 2. Fitur yang Didesain
**Jadwal shift (roster) — opsional.** Usaha dengan jam kerja yang sama setiap hari (kantor) tetap memakai jadwal kerja mingguan yang sudah ada dan **tidak melihat apa pun tentang shift**. Usaha dengan shift (kafe, toko, pabrik kecil) membuat **master shift** lalu menyusun **roster** per karyawan per tanggal.

- **Master shift** per usaha: nama + jam mulai–selesai. Shift **melewati tengah malam** didukung (mis. Malam 22:00–06:00, selesai keesokan hari).
- **Mode jadwal per karyawan:** **Ikut jadwal usaha** (default) atau **Shift (roster)**. Hanya karyawan mode shift yang muncul di roster.
- **Roster:** tabel karyawan × tanggal (minggu ini / minggu berikutnya). Klik sel → pilih shift atau **Libur**. **Satu shift per karyawan per tanggal.** Tombol **"Salin minggu lalu"**.
- **Sel terkunci** (tidak bisa diubah, koreksi lewat menu Koreksi absensi): tanggal sudah lewat, karyawan sudah absen di tanggal itu, atau periode gaji sudah final.
- Roster boleh diubah kapan saja untuk hari ini & ke depan (mis. menggantikan rekan). Tanpa aturan jeda minimal antar shift.
- Setiap perubahan tercatat di log audit (dari → ke) dan karyawan **diberi tahu lewat email**.
- **Opsional (WAJIB diperhatikan):** selama usaha belum punya master shift, **menu Roster tidak muncul** dan pilihan mode "Shift (roster)" di Pengaturan absen **nonaktif** dengan ajakan membuat shift dulu.
- Absensi karyawan shift (fitur berikutnya): telat dihitung dari jam mulai shift; hari tanpa shift = libur; absen di hari tanpa shift tetap diterima dengan tanda **"Tanpa jadwal"**.

## 3. Peran
- **Pemilik & Admin:** kelola master shift, ubah mode jadwal karyawan, susun roster semua karyawan.
- **Atasan:** susun roster **bawahan langsung** saja (hanya mereka yang tampil). Tidak bisa mengelola master shift; mode jadwal hanya bisa dibaca.
- **Karyawan:** di portal melihat **"Jadwal saya"** beberapa hari ke depan (hanya bila mode shift).

## 4. Batasan (WAJIB — preferensi user)
- Tanpa gradient warna-warni (termasuk mesh), tanpa glow/pendar. Blur hanya untuk panel kaca.
- **Tanpa badge/pill ber-titik (dot)**, tanpa eyebrow label warna-warni, tanpa titik dekoratif.
- **Tanpa ikon hiasan dalam kotak/lingkaran per baris.** Ikon hanya untuk aksi, status, atau navigasi; satu ikon per konteks.
- **Jangan beri warna berbeda per shift** (bukan kalender warna-warni). Bedakan shift lewat teks (nama + jam) di chip netral; Libur = teks redup; sel terkunci = ikon gembok kecil + redup.
- Maksimal 2 level radius bersarang. Satu font weight per elemen. Kontras teks di atas kaca WCAG AA. Jam di permukaan paling solid, angka tabular.
- Hanya efek yang bisa dibuat dengan CSS standar.

## 5. Yang Didesain Sekarang
Usaha **Kopi Nusantara** (Kota Makassar), pengguna **Budi Santoso** (Pemilik). Desktop 1440px + mobile 390px untuk setiap area (portal: mobile saja), plus state yang disebut.

Data contoh master shift:
- **Pagi** 07:00–15:00
- **Siang** 15:00–23:00
- **Malam** 22:00–06:00 (+1 hari)

Karyawan mode shift: **Dewi Lestari** (Barista), **Rina Wulandari** (Kasir), **Agus Pratama** (Barista), **Maya Sari** (Barista), **Hendra Wijaya** (Roaster). Ikut jadwal usaha: Budi Santoso, Siti Rahmawati (Keuangan), Fajar Nugroho (Kurir).

### Area 1 — Shift kerja (section baru di Pengaturan › Absensi `/settings/attendance`)
Halaman Pengaturan absensi sudah berisi section form-section "Jadwal kerja", "Hari libur", "Hari kerja", "Riwayat aturan potongan". Tambahkan section **"Shift kerja"** setelah "Jadwal kerja" (bukan menu baru — agar usaha tanpa shift tidak terganggu).
- **Keadaan kosong (default, usaha belum pakai shift):** teks singkat "Usaha Anda memakai jadwal kerja di atas untuk semua karyawan. Aktifkan shift jika karyawan bekerja bergiliran (mis. pagi/siang/malam)." + tombol sekunder **"Aktifkan shift"** (membuka dialog tambah shift pertama). Harus terasa ringan — satu baris penjelasan, bukan banner besar.
- **Ada shift:** daftar/tabel kaca: nama, jam `07:00–15:00` (tabular), durasi `8 jam`, keterangan "selesai keesokan hari" untuk shift malam, jumlah karyawan yang terjadwal minggu ini; aksi **Ubah** + menu "⋯" **Hapus**. Tombol **"Tambah shift"**. Tautan **"Buka roster"**.
- **Dialog Tambah/Ubah shift:** Nama shift* (mis. "Pagi"), Jam mulai*, Jam selesai* (input jam). Bila selesai ≤ mulai: keterangan info "Selesai keesokan hari (+1) — durasi 8 jam". Error: "Nama shift sudah dipakai", "Jam mulai dan selesai tidak boleh sama". Info kecil saat ubah: "Perubahan jam berlaku untuk roster yang belum terkunci."
- **Dialog Hapus:** "Hapus shift Malam?" + "Shift ini terjadwal untuk 6 hari ke depan. Jadwal itu akan kosong dan perlu diisi ulang." + tombol bahaya. Bila tidak terpakai: teks lebih singkat.
- **Skeleton** daftar.

### Area 2 — Mode jadwal di Pengaturan absen karyawan (section di `/employees/[id]` tab Data)
Section **"Pengaturan absen"** yang sudah ada (baris Lokasi absen, Wajib selfie). Tambahkan baris **"Mode jadwal"**.
- **Baca:** "Ikut jadwal usaha (Sen–Jum 08:00–17:00)" / "Shift (roster)" + tautan kecil "Lihat roster".
- **Ubah:** segmented **Ikut jadwal usaha | Shift (roster)** + keterangan "Karyawan shift hanya dijadwalkan pada tanggal yang diisi di roster. Hari tanpa shift dihitung libur."
- **Usaha belum punya shift:** pilihan "Shift (roster)" nonaktif + teks "Buat shift dulu di Pengaturan › Absensi" (tautan).
- **Tampilan atasan:** hanya baca.

### Area 3 — Roster `/attendance/roster` (halaman baru)
Menu sidebar **Absensi › Roster** (child baru setelah "Rekap"; terlihat untuk pemilik, admin, atasan) — **hanya muncul jika usaha punya minimal satu shift**.
- Judul "Roster" + sub-judul "Atur shift karyawan per tanggal. Hari tanpa shift dihitung libur."
- Toolbar: navigasi minggu (‹ **5–11 Okt 2026** ›) + segmented **Minggu ini | Minggu depan**, select **Departemen**, tombol sekunder **"Salin minggu lalu"**.
- **Tabel kaca (desktop):** kolom pertama karyawan (avatar inisial + nama + jabatan kecil), lalu 7 kolom tanggal (header "Sen 5", "Sel 6", …; **hari ini** ditandai halus, mis. header tebal + garis aksen tipis di bawah — bukan latar warna-warni). Sel berisi **chip netral** "Pagi · 07–15" / "Malam · 22–06" atau teks redup "Libur"; sel kosong = "—" (belum diatur). Ringkasan kecil per baris di kanan: "5 shift".
- **Klik sel** → popover/dropdown kecil: daftar shift (nama + jam), **Libur**, **Kosongkan**. Pilihan aktif dicentang. Perubahan langsung tersimpan (tampilkan state menyimpan kecil di sel + toast "Roster disimpan · Dewi diberi tahu lewat email").
- **Sel terkunci:** redup + ikon gembok kecil; hover/klik → tooltip alasan: "Sudah lewat", "Sudah absen", atau "Periode gaji sudah final". Contoh: Senin 5 Okt Dewi & Rina sudah absen.
- **Dialog "Salin minggu lalu":** "Salin roster 28 Sep–4 Okt ke 5–11 Okt?" + ringkasan "28 sel akan diisi · 4 sel terkunci dilewati · sel yang sudah diisi akan ditimpa". Konfirmasi + Batal.
- Catatan di bawah tabel: "3 karyawan ikut jadwal usaha tidak tampil di roster." + tautan.
- **Empty state:** belum ada karyawan mode shift → "Belum ada karyawan bermode shift" + teks "Ubah mode jadwal di detail karyawan (Pengaturan absen)." + tautan ke daftar karyawan.
- **Mobile:** tampilan per karyawan (card) **atau** per hari (pilih yang paling nyaman di 390px; rekomendasi: pilih tanggal lewat strip 7 hari di atas, lalu daftar karyawan dengan shift masing-masing; ketuk → sheet pilih shift).
- **Skeleton** tabel.
- **Tampilan atasan** (frame kecil): judul sama, hanya bawahan langsung (Dewi, Agus), tanpa tombol kelola shift.

### Area 4 — Portal karyawan `/me` (mobile 390px)
1. **Kartu "Jadwal saya"** di beranda (di bawah kartu absen), hanya untuk karyawan mode shift: 7 hari ke depan, satu baris per hari: "Sen 5 Okt · Pagi 07:00–15:00", "Sel 6 Okt · Libur", "Rab 7 Okt · Malam 22:00–06:00 (+1)". Hari ini ditandai. Teks kecil "Jadwal bisa berubah — Anda diberi tahu lewat email."
2. **Kartu absen** (yang sudah ada) pada hari ber-shift: baris "Shift Pagi · 07:00–15:00" menggantikan "Jadwal 08:00–17:00". Hari tanpa shift: "Tidak ada shift hari ini" — absen tetap bisa, setelah absen tampil keterangan ringan "Absen di luar jadwal — akan ditinjau atasan." (pola keterangan lokasi yang sudah ada).
3. **Belum ada roster minggu ini:** "Jadwal belum diatur — tanyakan atasan Anda."

### Area 5 — Rincian absensi & tinjauan (perubahan kecil, desktop + mobile)
- Tabel rincian absensi (Tanggal | Masuk | Pulang | Status): tambahkan **shift hari itu** di bawah tanggal (mis. "Pagi 07–15"), atau "Libur" untuk hari tanpa shift. Shift malam: jam pulang keesokan hari diberi tanda "+1".
- Antrean tinjauan: jenis tanda baru **"Tanpa jadwal"** (badge netral/info, rincian "Tidak ada shift pada Sab 10 Okt") — memakai badge tanda generik yang sudah ada.

## 6. Output yang Diharapkan
1. Lima area di atas dengan semua state yang disebut — desktop 1440px + mobile 390px (portal: mobile saja). High fidelity, data contoh realistis.
2. **Komponen baru beserta variannya** (nama berdasarkan peran, bisa dipetakan ke Tailwind v4 `@theme` yang sudah ada): baris/tabel master shift, dialog shift (termasuk state +1 hari), chip shift (shift, libur, kosong, terkunci, menyimpan), popover pemilih shift, navigasi minggu, dialog salin minggu lalu, kartu "Jadwal saya", baris "Mode jadwal" (baca/ubah/nonaktif).
3. Pakai ulang token yang sudah ada; jika butuh token baru, sebutkan eksplisit beserta alasannya.
4. Semua bisa diimplementasikan dengan CSS standar + Tailwind v4.
