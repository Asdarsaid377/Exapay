# Prompt Claude Design — Landing Page Marketing `/`

_Disusun 2026-10-02 untuk feature 43. Salin seluruh isi di bawah garis ke Claude Design **di project/percakapan yang sama dengan desain glassmorphism sebelumnya** (agar token & komponen dipakai ulang), lalu kirim link hasilnya ke Claude Code (lihat `../ui-workflow.md` "Jalur Claude Design"). Prompt sebelumnya (halaman Karyawan) ada di riwayat git._

---

# Brief Desain UI — Exapay: Landing Page Marketing

## 1. Konteks
Lanjutan dari desain **Exapay tema Glassmorphism** yang sudah disetujui (Dashboard owner, Portal `/me`, Design token, halaman Karyawan). **Pakai ulang persis** token, logo ("e" + "exapay"), card kaca, tombol pill, input, badge, dan latar krem dengan bentuk warna flat dari desain itu. Gaya baru hanya untuk pola khas landing page (hero, section marketing, tabel harga, FAQ, footer).

Exapay: SaaS yang **membantu tugas HRD di UMKM Indonesia dengan karyawan < 50 orang** yang belum punya orang HR. Exapay bukan pengganti HRD: sistem menghitung, memandu, dan mengingatkan — keputusan tetap di tangan pemilik/atasan. Semua teks **Bahasa Indonesia**, nada lugas dan membumi untuk pemilik usaha (bukan bahasa korporat). Tanggal contoh `2 Okt 2026`.

Ringkasan token: aksen oranye `#F2790F` (hover `#D9600A`, teks aksen `#B34C08`), latar krem `#FBF8F3` dengan bentuk warna flat lembut, teks `#221208` / `#5B4636` / `#8A7561`, sukses `#15803D`, peringatan `#D97706`, bahaya `#DC2626`, info `#2563EB`. Font Plus Jakarta Sans (judul) + DM Sans (teks). Card kaca radius 22px, field 14px, tombol pill; **teks tombol primer `#221208`** (bukan putih).

## 2. Pengunjung
Pemilik UMKM (kedai kopi, toko roti, bengkel, toko retail, klinik kecil, agensi) 5–50 karyawan yang saat ini menghitung gaji, BPJS, dan PPh 21 di Excel, koordinasi tugas lewat WhatsApp, dan mencatat absensi manual. Banyak yang membuka dari HP. Tujuan halaman: memahami apa yang dikerjakan Exapay, melihat harga yang jelas, lalu klik **"Coba gratis 30 hari"**.

## 3. Batasan (WAJIB — preferensi user)
- Tanpa gradient warna-warni (termasuk mesh), tanpa glow/pendar. Blur hanya untuk panel kaca.
- **Tanpa badge/pill ber-titik (dot) di atas judul hero** (contoh yang ditolak: pill "• Asisten HRD untuk UMKM"). Tagline cukup teks biasa atau tidak ada.
- **Tanpa deretan ikon dalam kotak/lingkaran sebagai hiasan daftar fitur.** Fitur ditulis sebagai teks + cuplikan UI nyata. Ikon hanya untuk aksi/status/navigasi.
- Tanpa eyebrow label warna-warni, titik dekoratif, atau ilustrasi 3D/blob generik.
- **Tanpa bukti sosial palsu:** jangan buat testimoni, logo klien, rating bintang, atau angka "dipakai 1.000+ usaha" — produk baru diluncurkan. Kepercayaan dibangun lewat penjelasan yang konkret (aturan PMK 168/2023, BPJS, UMK per kota, audit log, data terenkripsi).
- Maksimal 2 level radius bersarang. Satu font weight per elemen. Kontras teks di atas kaca WCAG AA. Angka/harga di permukaan paling solid.
- Harus cepat dimuat (target Lighthouse ≥ 90): hindari efek berat; gambar seminimal mungkin. Cuplikan UI boleh dibuat sebagai komponen HTML/CSS (versi mini dari dashboard/portal yang sudah ada), bukan screenshot.
- Hanya efek yang bisa dibuat dengan CSS standar.

## 4. Yang Didesain Sekarang
Satu halaman panjang, **desktop 1440px + mobile 390px**, plus state yang disebut di bawah.

### Header (sticky)
Logo exapay kiri. Tautan anchor: Fitur · Cara kerja · Harga · FAQ. Kanan: tautan **"Masuk"** (ke `/login`) + tombol primer **"Coba gratis"** (ke `/signup`). Mobile: logo + tombol "Coba gratis" + menu (sheet/drawer berisi anchor + Masuk).

### 1. Hero
- Judul (contoh, boleh disempurnakan): **"Gaji, absensi, dan kinerja karyawan beres tanpa Excel."**
- Sub-judul: "Exapay menghitung gaji lengkap dengan BPJS dan PPh 21 TER, mencatat absensi dari HP karyawan, dan mengubah tugas harian jadi skor kinerja yang bisa dijelaskan. Untuk UMKM yang belum punya HRD."
- CTA primer **"Coba gratis 30 hari"** + sekunder **"Lihat harga"** (anchor). Baris kecil di bawah: "Tanpa kartu kredit · Data tetap milik Anda".
- Visual kanan (desktop) / bawah (mobile): komposisi cuplikan UI nyata dari desain sebelumnya — mis. kartu ringkasan payroll Oktober 2026 (Total gaji bersih Rp 48.215.400, 15 karyawan, status Draf) bertumpuk dengan kartu portal karyawan di frame HP (tombol "Absen masuk", tugas hari ini). Gunakan data usaha contoh **Kopi Nusantara**.

### 2. Masalah yang diselesaikan
Judul mis. "Masih begini di usaha Anda?". 4 poin berpasangan **sebelum → dengan Exapay**, ditulis sebagai teks (tanpa ikon hiasan):
- Gaji, BPJS & PPh 21 dihitung manual di Excel, aturannya sering berubah → dihitung otomatis dengan aturan yang berlaku per tanggal
- Tugas dikoordinasi lewat WhatsApp, tidak ada data siapa yang kinerjanya bagus → tugas harian tercatat & diverifikasi atasan, jadi skor yang bisa dijelaskan
- Absensi manual, potongan gaji tidak konsisten → absen dari HP, potongan mengikuti aturan yang Anda tetapkan, lengkap dengan penjelasan
- Tenggat setor BPJS/PPh 21, kontrak habis, masa percobaan terlupa → pengingat di dashboard & email H-7 dan H-1

### 3. Fitur utama
5 blok, selang-seling teks + cuplikan UI kecil (desktop), bertumpuk di mobile. Setiap blok: judul, 1–2 kalimat, 3 poin teks.
1. **Payroll & PPh 21 TER** — komponen gaji, BPJS Kesehatan & Ketenagakerjaan dengan batas upah, PPh 21 TER bulanan + perhitungan ulang Desember, draf → review → final terkunci, slip gaji PDF terkirim ke email, ekspor Excel untuk transfer bank. Cuplikan: baris rincian slip (Gaji pokok, Tunjangan, BPJS, PPh 21, Gaji bersih).
2. **Absensi dari HP** — absen masuk/pulang dengan waktu server, izin/sakit/cuti dengan persetujuan atasan, aturan potongan alpa/telat sesuai kebijakan usaha. Cuplikan: kartu absen portal.
3. **Tugas harian → KPI** _(pembeda utama, beri penekanan visual lebih)_ — karyawan mencatat realisasi indikator, atasan memverifikasi, skor 0–100 dihitung dengan rumus terbuka; ringkasan kinerja dibantu AI **yang selalu ditinjau atasan sebelum final**. Cuplikan: skor 86 "Baik" + 3 indikator dengan progress bar.
4. **Kepatuhan** — kalender setor BPJS & PPh 21, kontrak habis, masa percobaan, peringatan gaji pokok di bawah UMK kota Anda. Cuplikan: daftar pengingat bertanggal.
5. **Portal karyawan** — aplikasi web yang bisa dipasang di HP (PWA): absen, catat tugas, ajukan izin, lihat slip & skor sendiri.

### 4. Cara kerja
3 langkah bernomor (angka sebagai tipografi besar, bukan lingkaran ikon):
1. Daftar & isi profil usaha (kota untuk UMK, tanggal gajian) — aturan BPJS, PPh 21, jadwal kerja & template KPI bawaan langsung siap
2. Tambah karyawan atau impor dari Excel, lalu undang mereka ke portal
3. Setiap bulan: tinjau draf gaji yang sudah dihitung, finalisasi, slip terkirim otomatis

### 5. Harga
- Satu paket, sederhana: **Rp10.000 per karyawan aktif per bulan**, minimum ditagih 5 karyawan (Rp50.000/bulan). Semua fitur termasuk. Trial gratis 30 hari. Bayar via QRIS (semua e-wallet & m-banking). _(Angka ini akan diambil dari database — tandai di desain sebagai data dinamis.)_
- Daftar "Sudah termasuk" sebagai teks: semua modul, pengguna owner/admin/atasan tanpa batas, portal karyawan, slip PDF & email, ekspor Excel, pembaruan aturan BPJS/PPh 21/UMK.
- **Kalkulator estimasi:** input jumlah karyawan (stepper − / angka / + dan/atau slider 1–50) → "Estimasi tagihan per bulan: **Rp150.000**" untuk 15 karyawan; jika < 5, tampilkan catatan "minimum ditagih 5 karyawan". CTA "Coba gratis 30 hari".
- Catatan kecil penjelas: "Tidak bayar setelah trial? Data tidak dihapus — akun menjadi baca-saja sampai tagihan dibayar."
- State: kalkulator di 3 karyawan (kena minimum), 15 karyawan, 50 karyawan; dan **skeleton** kartu harga (harga sedang dimuat).

### 6. FAQ (accordion, 1 terbuka)
- Apakah perhitungan PPh 21 sudah sesuai aturan terbaru? (TER PMK 168/2023, true-up Desember, data regulasi berlaku-tanggal)
- Apakah data karyawan aman? (NIK/NPWP/rekening terenkripsi & ditampilkan tersamar, akses per peran, setiap perubahan tercatat)
- Apakah Exapay mentransfer gaji? (Tidak — ekspor file untuk transfer bank)
- Apa yang terjadi setelah trial 30 hari?
- Bagaimana cara bayar? (QRIS, dikonfirmasi maksimal 1×24 jam)
- Apakah AI menentukan nilai karyawan? (Tidak — skor dari rumus, AI hanya membantu menulis ringkasan yang wajib ditinjau atasan)
- Bisa dipakai karyawan lewat HP?

### 7. CTA penutup
Panel kaca besar: "Coba Exapay gratis 30 hari" + kalimat pendek + tombol primer. Tanpa gradient.

### Footer
Logo + satu kalimat deskripsi. Kolom: Produk (Fitur, Harga, FAQ, Masuk), Legal (Kebijakan privasi, Syarat layanan), Kontak (email `halo@exapay.id`, WhatsApp `+62 812-0000-0000` — placeholder). Baris bawah: "© 2026 Exapay".

## 5. Output yang diminta
- Halaman lengkap desktop 1440 + mobile 390 (termasuk menu mobile terbuka).
- State: kalkulator (3 / 15 / 50 karyawan), skeleton harga, accordion FAQ tertutup/terbuka, hover tombol & tautan.
- Token baru (jika ada) bernama peran agar bisa dipetakan ke Tailwind v4 `@theme`; sebutkan ukuran tipografi khusus landing (judul hero, judul section) dan lebar konten maksimal.

---

# Revisi 1 — Pesan "cocok untuk UMKM yang belum menjalankan semua regulasi"

_Ditambahkan 2026-10-02 (permintaan user) setelah desain pertama digenerate. Kirim sebagai pesan lanjutan di percakapan Claude Design yang sama._

Revisi landing page Exapay: pengunjung jangan sampai mengira Exapay hanya untuk perusahaan besar yang sudah tertib PPh 21 & BPJS. Banyak UMKM belum memotong PPh 21, belum mendaftarkan semua karyawan ke BPJS, atau menggaji di bawah UMK. Tambahkan pesan ini **tanpa mengubah gaya, token, dan section lain**:

1. **Hero** — tambahkan satu kalimat pendek di bawah sub-judul (teks biasa, bukan badge/pill): "Belum potong PPh 21 atau belum semua karyawan ikut BPJS? Tetap bisa pakai — aturan dinyalakan sesuai kondisi usaha Anda."
2. **Section baru setelah "Masalah yang diselesaikan"** — judul mis. "Mulai dari kondisi usaha Anda sekarang". Kalimat pembuka: "Exapay dibuat untuk usaha kecil, bukan hanya perusahaan yang sudah punya HRD. Anda tidak harus sudah tertib semua aturan untuk mulai." Lalu 4 poin teks (tanpa ikon hiasan):
   - **BPJS diatur per karyawan** — pilih program yang diikuti tiap karyawan (Kesehatan, JHT, JP, JKK, JKM), atau tidak sama sekali. Bisa diubah kapan saja saat sudah mendaftar.
   - **PPh 21 dihitung otomatis** — untuk gaji di bawah batas penghasilan kena pajak, hasilnya Rp0. Anda tetap tahu kapan karyawan mulai kena pajak.
   - **Peringatan UMK bisa dimatikan** — tidak ada tanda merah yang mengganggu bila Anda belum siap.
   - **Potongan absensi sesuai kebijakan Anda** — termasuk pilihan "tidak dipotong".
   Tutup dengan satu kalimat kecil: "Saat usaha Anda tumbuh, Exapay membantu menertibkan aturan satu per satu — dengan pengingat, bukan paksaan."
   Visual pendamping (opsional, satu saja): cuplikan pengaturan kepesertaan BPJS per karyawan berisi 5 toggle dengan sebagian dimatikan.
3. **FAQ** — tambahkan pertanyaan di urutan kedua: "Usaha saya belum memotong PPh 21 dan belum semua karyawan ikut BPJS. Bisa pakai Exapay?" → jawab dengan ringkasan 4 poin di atas.
4. **Harga** — tambahkan satu baris di daftar "Sudah termasuk": "Cocok untuk usaha 5 karyawan sekalipun".

Tetap patuhi batasan sebelumnya: tanpa badge ber-titik, tanpa ikon hiasan per poin, tanpa gradient/glow, tanpa testimoni atau angka pengguna. Perbarui versi desktop 1440 dan mobile 390.
