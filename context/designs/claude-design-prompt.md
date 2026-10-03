# Prompt Claude Design — Panduan Setup Awal

_Disusun 2026-10-03 untuk feature 48. Salin seluruh isi di bawah garis ke Claude Design **di project/percakapan yang sama dengan desain glassmorphism sebelumnya** (Dashboard, Portal, Karyawan, Lokasi, Selfie, Shift — agar token & komponen dipakai ulang), lalu export zip ke `context/designs/` (atau kirim link) ke Claude Code. Prompt sebelumnya (shift & roster, feature 46) ada di riwayat git._

---

# Brief Desain UI — Exapay: Panduan Setup Awal ("Siapkan Exapay")

## 1. Konteks
Lanjutan dari desain **Exapay tema Glassmorphism** yang sudah disetujui. **Pakai ulang persis** token, sidebar, header (TenantSwitcher kiri, avatar + menu akun kanan), card kaca, stat tile, tombol pill, badge, progress bar (bila sudah ada), dialog, dropdown menu akun, dan **layout Dashboard owner** yang sudah ada. Gaya baru hanya untuk pola yang belum ada (lihat bagian 5).

Exapay: SaaS yang membantu tugas HRD di **UMKM Indonesia, karyawan < 50 orang**, tanpa staf HR — payroll lengkap dengan BPJS & PPh 21, absensi dari HP, tugas harian → KPI. Semua teks **Bahasa Indonesia**, nada lugas & ramah untuk pemilik usaha yang bukan orang HR. Usaha contoh **"Kopi Nusantara"**, pemilik **Budi**, tanggal **Senin 5 Okt 2026**.

Ringkasan token: aksen oranye `#F2790F` (hover `#D9600A`, teks aksen `#B34C08`), latar krem `#FBF8F3` dengan bentuk warna flat lembut, teks `#221208` / `#5B4636` / `#8A7561`, sukses `#15803D`, peringatan `#D97706`, bahaya `#DC2626`, info `#2563EB`. Font Plus Jakarta Sans (judul) + DM Sans (teks). Card kaca radius 22px, field 14px, tombol pill; **teks tombol primer `#221208`** (bukan putih).

## 2. Fitur yang Didesain
Pemilik yang baru mendaftar masuk ke dashboard yang masih kosong dan tidak tahu harus mulai dari mana. **Kartu checklist "Siapkan Exapay"** di **paling atas dashboard** memandu langkah setup sampai payroll pertama. Bukan modal/pop-up — tidak menghalangi kerja; dashboard tetap terlihat di bawahnya.

**Langkah wajib (urutan tetap, centang otomatis dari data — pengguna tidak mencentang sendiri, kecuali langkah 3):**
1. **Lengkapi profil usaha** — kota (menentukan zona waktu & UMK) dan tanggal gajian. Tombol: "Lengkapi profil"
2. **Buat departemen & jabatan** — mis. Operasional · Barista. Tombol: "Atur organisasi"
3. **Cek jadwal kerja & hari libur** — jadwal bawaan Senin–Jumat 08.00–17.00 sudah dibuat otomatis; cukup dicek. Tombol: "Cek jadwal" + tautan sekunder **"Tandai sudah dicek"**
4. **Tambah karyawan** — satu per satu atau impor dari Excel. Tombol: "Tambah karyawan" + tautan sekunder "Impor Excel"
5. **Atur gaji karyawan** — gaji pokok, tunjangan, kepesertaan BPJS. Keterangan progres: **"8 dari 12 karyawan sudah diatur"**. Tombol: "Atur gaji"
6. **Undang karyawan ke portal** — agar bisa absen dari HP dan melihat slip gaji. Keterangan: **"3 dari 12 karyawan punya akun"**. Tombol: "Undang karyawan"
7. **Buka periode gaji pertama** — hitung gaji, BPJS & PPh 21 otomatis, cek draf, lalu finalkan. Tombol: "Buka periode gaji"

**Tambahan (opsional, tidak dihitung di progres):** Lokasi kerja (cek lokasi saat absen) · Shift kerja (untuk usaha dengan shift) · Aturan potongan absensi · Template KPI per jabatan. Tampil ringkas sebagai daftar tautan, bisa dilipat.

**Perilaku:**
- Progres "N dari 7 langkah" + progress bar tipis. Langkah selesai: centang hijau, teks redup, tanpa tombol. **Langkah berikutnya** (yang pertama belum selesai) disorot: deskripsi + tombol primer. Langkah lain yang belum selesai: judul saja + tombol sekunder kecil / chevron.
- Langkah boleh dikerjakan tidak berurutan — yang sudah selesai tetap tercentang.
- **Lewati:** tombol teks "Lewati panduan" di kepala kartu → dialog konfirmasi kecil: "Sembunyikan panduan? Anda bisa membukanya lagi dari menu akun › Panduan setup." [Batal] [Sembunyikan]. Berlaku untuk seluruh usaha (semua pemilik/admin).
- **Dibuka lagi** dari dropdown menu akun (avatar kanan atas): item **"Panduan setup"** dengan keterangan progres kecil "4/7". Item ini hanya muncul selama panduan disembunyikan dan belum selesai.
- **Semua selesai:** kartu berubah ringkas — "Exapay siap dipakai" + satu kalimat ("Payroll pertama Anda sudah dibuat. Panduan ini tidak akan muncul lagi.") + tombol "Tutup". Setelah ditutup tidak muncul lagi.
- Usaha yang sudah lama berjalan (data lengkap) tidak melihat kartu ini sama sekali.

## 3. Peran
- **Pemilik & Admin:** melihat & melewati panduan.
- **Atasan & Karyawan:** **tidak** melihat panduan (tidak perlu didesain, cukup catatan).

## 4. Batasan (WAJIB — preferensi user)
- Tanpa gradient warna-warni (termasuk mesh), tanpa glow/pendar. Blur hanya untuk panel kaca.
- **Tanpa badge/pill ber-titik (dot)**, tanpa eyebrow label warna-warni, tanpa titik dekoratif.
- **Tanpa ikon hiasan dalam kotak/lingkaran per baris.** Ikon hanya untuk status (centang selesai / lingkaran kosong belum), aksi, atau navigasi; satu ikon per konteks. Tanpa ilustrasi maskot/konfeti.
- Maksimal 2 level radius bersarang. Satu font weight per elemen. Kontras teks di atas kaca WCAG AA. Angka tabular.
- Kartu tidak boleh terlalu tinggi di desktop: langkah selesai & belum (selain langkah berikutnya) satu baris saja; target tinggi kartu ≤ ±520px di desktop.
- Hanya efek yang bisa dibuat dengan CSS standar.

## 5. Komponen Baru
- **SetupGuideCard** — kartu kaca di atas dashboard: judul "Siapkan Exapay", subjudul satu kalimat ("Ikuti langkah ini sampai payroll pertama — ±20 menit."), progres "3 dari 7 langkah" + progress bar, tombol teks "Lewati panduan".
- **SetupStepRow** — tiga keadaan: selesai (centang hijau, judul redup), berikutnya (disorot: judul tebal, deskripsi 1–2 baris, keterangan progres bila ada, tombol primer + tautan sekunder), belum (judul + tombol sekunder kecil). Seluruh baris selain yang selesai bisa diklik.
- **SetupExtrasList** — "Tambahan (opsional)" dapat dilipat, daftar tautan satu baris dengan keterangan pendek.
- **SetupSkipDialog** — dialog konfirmasi kecil.
- **Item menu akun "Panduan setup"** dengan progres kecil di kanan.
- **SetupDoneCard** — keadaan semua selesai.

## 6. Layar yang Diminta (desktop 1440 & mobile 390)
1. **Dashboard owner — baru daftar (0/7):** kartu panduan di atas, langkah 1 disorot; di bawahnya dashboard kosong (stat tile bernilai 0 / "—") seperti desain dashboard yang ada.
2. **Sebagian selesai (4/7):** langkah 1–4 tercentang, **langkah 5 "Atur gaji"** disorot dengan "8 dari 12 karyawan sudah diatur"; bagian Tambahan terlipat.
3. **Bagian Tambahan terbuka** (boleh digabung dengan layar 2 versi lain).
4. **Dialog Lewati.**
5. **Panduan disembunyikan:** dashboard tanpa kartu + dropdown menu akun terbuka menampilkan "Panduan setup 4/7".
6. **Semua selesai:** SetupDoneCard di atas dashboard yang sudah berisi data.
7. **Mobile 390:** layar 1 & 2 (kartu memenuhi lebar, tombol langkah berikutnya full-width, tinggi sentuh ≥ 44px).

Sertakan juga halaman komponen **setup-components** (semua keadaan SetupStepRow, progress bar, item menu, dialog) seperti halaman komponen pada desain sebelumnya.
