# Prompt Claude Design — Lokasi Kerja & Tinjauan Absensi (Geofence)

_Disusun 2026-10-02 untuk feature 44. Salin seluruh isi di bawah garis ke Claude Design **di project/percakapan yang sama dengan desain glassmorphism sebelumnya** (agar token & komponen dipakai ulang), lalu kirim link hasilnya ke Claude Code (lihat `../ui-workflow.md` "Jalur Claude Design"). Prompt sebelumnya (landing page, feature 43) ada di riwayat git._

---

# Brief Desain UI — Exapay: Lokasi Kerja & Tinjauan Absensi

## 1. Konteks
Lanjutan dari desain **Exapay tema Glassmorphism** yang sudah disetujui (Dashboard owner, Portal `/me`, Design token, halaman Karyawan). **Pakai ulang persis** token, sidebar, header (tenant switcher + avatar), card kaca, tombol pill, input, badge, segmented control, tab bar, data-table kaca, filter bar, form-section 2 kolom, read-field, banner, dialog, dan kartu absen portal dari desain itu. Gaya baru hanya untuk pola yang belum ada (lihat bagian 5).

Exapay: SaaS yang membantu tugas HRD di **UMKM Indonesia, karyawan < 50 orang**, tanpa staf HR. Semua teks **Bahasa Indonesia**, nada lugas untuk pemilik usaha. Tanggal contoh `2 Okt 2026`, zona waktu **WITA**.

Ringkasan token: aksen oranye `#F2790F` (hover `#D9600A`, teks aksen `#B34C08`), latar krem `#FBF8F3` dengan bentuk warna flat lembut, teks `#221208` / `#5B4636` / `#8A7561`, sukses `#15803D`, peringatan `#D97706`, bahaya `#DC2626`, info `#2563EB`. Font Plus Jakarta Sans (judul) + DM Sans (teks). Card kaca radius 22px, field 14px, tombol pill; **teks tombol primer `#221208`** (bukan putih).

## 2. Fitur yang Didesain
**Absen berbasis lokasi dengan peringatan (geofence), bukan pemblokiran.** Pemilik menyimpan satu atau beberapa lokasi kerja (koordinat + radius). Saat karyawan absen masuk/pulang dari HP, aplikasi membaca GPS dan menghitung jarak ke lokasi terdekat:

- **Di lokasi**: tidak ada tanda.
- **Di luar lokasi**: tanda + jarak, mis. "320 m dari Kedai Pettarani".
- **Lokasi tidak akurat**: akurasi GPS lebih besar dari radius, mis. "akurasi ±450 m".
- **Tanpa lokasi**: karyawan menolak izin lokasi / GPS mati.

**Absen selalu diterima**, apa pun statusnya. Tanda **tidak mengubah gaji otomatis**. Absen bertanda masuk ke **antrean tinjauan**. Di sana pemilik/admin (atau atasan untuk bawahan langsungnya) memutuskan **"Diterima"** atau **"Perlu tindak lanjut"** dengan catatan opsional. Jika memang perlu koreksi, prosesnya tetap lewat menu Koreksi absensi yang sudah ada.

Karyawan lapangan (kurir, sales) bisa **dikecualikan**. Usaha tanpa lokasi kerja sama sekali tidak terpengaruh: tidak ada pengecekan dan **tidak ada permintaan izin lokasi**.

**Tanpa peta pihak ketiga** (tanpa Google Maps/Leaflet/tile peta). Lokasi cukup ditampilkan sebagai nama, koordinat, radius, dan jarak dalam teks/angka.

## 3. Peran
- **Pemilik & Admin:** kelola lokasi kerja, atur lokasi per karyawan, tinjau semua absen bertanda.
- **Atasan:** hanya meninjau absen bertanda milik **bawahan langsung**. Tidak bisa mengelola lokasi; pengaturan absen karyawan hanya bisa dibaca.
- **Karyawan:** di portal hanya melihat keterangan setelah absen.

## 4. Batasan (WAJIB — preferensi user)
- Tanpa gradient warna-warni (termasuk mesh), tanpa glow/pendar. Blur hanya untuk panel kaca.
- **Tanpa badge/pill ber-titik (dot)**, tanpa eyebrow label warna-warni, tanpa titik dekoratif.
- **Tanpa ikon hiasan dalam kotak/lingkaran per baris.** Ikon hanya untuk aksi, status, atau navigasi; satu ikon per konteks. Ikon pin peta sebagai hiasan di setiap kartu lokasi **tidak boleh**.
- Tanpa ilustrasi peta palsu / gambar peta dekoratif.
- Maksimal 2 level radius bersarang. Satu font weight per elemen. Kontras teks di atas kaca WCAG AA. Angka penting (jarak, koordinat, jam) di permukaan paling solid.
- Hanya efek yang bisa dibuat dengan CSS standar.

## 5. Yang Didesain Sekarang
Usaha **Kopi Nusantara** (Kota Makassar), pengguna **Budi Santoso** (Pemilik). Desktop 1440px + mobile 390px untuk setiap halaman, plus state yang disebut.

### Halaman 1 — Lokasi Kerja `/settings/locations`
Menu sidebar **Pengaturan › Lokasi kerja** aktif (child baru di grup Pengaturan, setelah "Absensi").

- Judul "Lokasi kerja" + sub-judul: "Absen di luar lokasi tetap diterima, tetapi diberi tanda untuk ditinjau." Aksi kanan: tombol primer **"Tambah lokasi"**.
- Daftar lokasi (card kaca per lokasi, atau tabel kaca). Isi per lokasi: **nama**, alamat/catatan (opsional, teks redup), koordinat `-5.15672, 119.43628` (font angka tabular), **radius 100 m**, dan aksi **Ubah** + menu "⋯" berisi **Hapus**.
  - Kedai Pettarani: Jl. A. P. Pettarani No. 18; `-5.15672, 119.43628`; radius 100 m
  - Gudang Roasting Tamalanrea: Jl. Perintis Kemerdekaan Km 10; `-5.13241, 119.48810`; radius 150 m
- Ringkasan kecil di bawah daftar: "16 karyawan dicek di semua lokasi · 1 hanya Gudang Roasting · 2 dikecualikan". Beri tautan ke daftar karyawan.
- Catatan bantuan (teks biasa atau banner info): "Tips: tekan 'Pakai lokasi saya sekarang' saat Anda berada di tempat usaha. Radius 100 m cocok untuk satu bangunan; besarkan jika sinyal GPS di lokasi sering meleset."
- **Empty state:** "Belum ada lokasi kerja" + penjelasan "Tanpa lokasi kerja, absen tidak dicek lokasinya." + tombol "Tambah lokasi".
- **Skeleton** daftar.

**Dialog Tambah/Ubah lokasi** (sheet dari bawah di mobile):
- Nama lokasi* (mis. "Kedai Pettarani")
- Alamat / catatan (opsional)
- **Koordinat***: satu field teks yang menerima tempelan "lat, long" (mis. `-5.15672, 119.43628`), dengan keterangan "Bisa ditempel dari aplikasi peta". Tombol sekunder **"Pakai lokasi saya sekarang"** (ikon crosshair). Tunjukkan state-nya:
  1. Normal
  2. Mencari lokasi… (spinner, tombol nonaktif)
  3. Berhasil: koordinat terisi + teks kecil "Akurasi ±12 m"
  4. Akurasi buruk: koordinat terisi + peringatan "Akurasi ±85 m — coba lagi di luar ruangan atau dekat jendela"
  5. Gagal: "Izin lokasi ditolak browser. Izinkan lokasi atau isi koordinat manual."
- **Radius (meter)***: input angka + satuan "m", default 100, rentang 25–1.000. Keterangan "Absen lebih jauh dari radius ini diberi tanda."
- Error validasi: "Format koordinat: lintang, bujur — contoh -5.15672, 119.43628"; "Radius 25–1.000 m".
- Tombol Simpan (primer, ada state loading) + Batal.

**Dialog Hapus:** "Hapus lokasi Gudang Roasting Tamalanrea?" + teks "Absen yang sudah tercatat tidak berubah. 1 karyawan yang hanya dicek di lokasi ini akan dicek di semua lokasi." + tombol bahaya "Hapus" + Batal.

### Halaman 2 — Pengaturan absen per karyawan (section di detail karyawan `/employees/[id]`, tab Data)
Tambahkan **section baru "Pengaturan absen"** di tab Data detail karyawan, memakai pola form-section 2 kolom dan read-field yang sudah ada. Taruh setelah section Pekerjaan. Section ini nanti juga menampung "Wajib selfie" dan "Mode jadwal" (fitur berikutnya, **jangan didesain sekarang**). Layout harus siap untuk beberapa baris pengaturan.

- **Tampilan baca:** baris "Lokasi absen" dengan nilai salah satu dari:
  - "Semua lokasi kerja (2)"
  - "Lokasi tertentu: Gudang Roasting Tamalanrea"
  - "Dikecualikan — absen dari mana saja tanpa tanda"
  - Bila usaha belum punya lokasi: "Belum ada lokasi kerja" + tautan "Atur lokasi kerja"

  Tombol **Ubah** kecil per section (pemilik/admin).
- **Mode ubah:** segmented control **Semua lokasi | Lokasi tertentu | Dikecualikan**. Untuk "Lokasi tertentu", tampilkan daftar checkbox lokasi (minimal satu dipilih; error "Pilih minimal satu lokasi"). Untuk "Dikecualikan", keterangan "Cocok untuk karyawan lapangan seperti kurir atau sales." Tombol Simpan + Batal.
- Contoh: **Fajar Nugroho** (Kurir · Logistik) dikecualikan; **Hendra Wijaya** (Roaster · Produksi) lokasi tertentu = Gudang Roasting; **Dewi Lestari** semua lokasi.
- **Tampilan atasan:** hanya baca, tanpa tombol Ubah.

### Halaman 3 — Tinjauan Absensi `/attendance/review`
Menu sidebar **Absensi › Tinjauan** aktif (child baru setelah "Pengajuan izin"; terlihat untuk pemilik, admin, atasan).

- Judul "Tinjauan absensi" + sub-judul "Absen bertanda tetap tercatat dan tidak mengubah gaji. Koreksi jam lewat menu Koreksi."
- Filter bar: segmented **Perlu ditinjau (5) | Sudah ditinjau | Semua** (default Perlu ditinjau), select **Jenis tanda** (Semua / Di luar lokasi / Lokasi tidak akurat / Tanpa lokasi), rentang tanggal / bulan.
- **Tabel kaca** (desktop), **satu baris per absen** (masuk dan pulang bisa jadi dua baris terpisah):
  - Karyawan (avatar inisial + nama, jabatan kecil)
  - Tanggal
  - Absen ("Masuk 08:04" / "Pulang 17:12")
  - **Tanda** (badge status + rincian teks di bawahnya). Badge berwarna peringatan untuk "Di luar lokasi" dan "Lokasi tidak akurat", netral/info untuk "Tanpa lokasi". **Jenis tanda harus generik**: nanti ada jenis lain ("Tanpa jadwal" untuk karyawan shift), jadi jangan buat layout khusus per jenis.
  - Aksi: tombol **"Diterima"** (sekunder) dan **"Perlu tindak lanjut"** (sekunder/peringatan). Keduanya membuka dialog catatan.
- Data contoh (Perlu ditinjau):
  - Fajar Nugroho tidak muncul (dikecualikan)
  - Rina Wulandari — Kasir — 2 Okt 2026 — Masuk 07:58 — **Di luar lokasi**: 320 m dari Kedai Pettarani (akurasi ±10 m)
  - Agus Pratama — Barista — 2 Okt 2026 — Masuk 08:11 — **Tanpa lokasi**: izin lokasi ditolak
  - Hendra Wijaya — Roaster — 1 Okt 2026 — Pulang 17:40 — **Di luar lokasi**: 1,2 km dari Gudang Roasting Tamalanrea (akurasi ±8 m)
  - Maya Sari — Barista — 1 Okt 2026 — Masuk 08:00 — **Lokasi tidak akurat**: akurasi ±450 m, terdekat Kedai Pettarani
  - Dewi Lestari — Barista — 30 Sep 2026 — Pulang 21:05 — **Di luar lokasi**: 2,4 km dari Kedai Pettarani (akurasi ±15 m)
- **Sudah ditinjau:** baris dengan badge keputusan **"Diterima"** (sukses) atau **"Perlu tindak lanjut"** (peringatan), oleh siapa + kapan ("Budi Santoso · 2 Okt 10:15"), dan catatan, mis. "Antar pesanan katering ke kantor pelanggan". Keputusan bisa diubah lewat menu "⋯ Ubah keputusan".
- **Dialog keputusan:** judul "Terima absen Rina Wulandari?" / "Tandai perlu tindak lanjut?". Ringkasan absen (tanggal, jam, tanda). Textarea **Catatan** (opsional untuk Diterima, **wajib** untuk Perlu tindak lanjut). Teks kecil "Tercatat di log audit." Untuk owner/admin pada "Perlu tindak lanjut": tautan sekunder "Buka koreksi absensi". Tombol konfirmasi + Batal.
- **Mobile:** tabel menjadi daftar card (nama, tanggal + jam, badge tanda + rincian, dua tombol aksi penuh lebar).
- **Empty state:** "Tidak ada absen yang perlu ditinjau" + teks "Absen di luar lokasi kerja akan muncul di sini." Jika usaha belum punya lokasi: "Lokasi kerja belum diatur" + tombol "Atur lokasi kerja" (pemilik/admin).
- **Skeleton** baris.
- **Tampilan atasan** (frame kecil): judul sama, hanya bawahan langsung (Rina, Agus, Dewi), tanpa tautan koreksi.

### Halaman 4 — Portal karyawan `/me` (kartu absen)
Pakai kartu absen portal yang sudah ada (desain `/me`). Mobile 390px saja. Karyawan **Dewi Lestari**. Tunjukkan state:

1. **Sebelum absen, pertama kali** (usaha punya lokasi & karyawan tidak dikecualikan): teks kecil di bawah tombol "Absen masuk": "Saat absen, Exapay membaca lokasi Anda untuk mencatat apakah Anda di area kerja." (sebelum dialog izin bawaan browser).
2. **Mengambil lokasi…**: tombol absen loading (spinner + "Mengambil lokasi…").
3. **Berhasil di lokasi**: tampilan sukses biasa ("Masuk 07:58"), tanpa keterangan tambahan.
4. **Berhasil, di luar lokasi**: sukses + keterangan (banner peringatan ringan, bukan error): **"Anda tercatat di luar area kerja (320 m dari Kedai Pettarani). Absen tetap diterima dan akan ditinjau atasan."**
5. **Berhasil, tanpa lokasi** (izin ditolak): sukses + keterangan "Lokasi tidak terbaca. Absen tetap diterima dan akan ditinjau. Izinkan lokasi di pengaturan browser untuk absen berikutnya."
6. **Berhasil, lokasi tidak akurat**: sukses + keterangan "Sinyal lokasi lemah (akurasi ±450 m). Absen tetap diterima dan akan ditinjau."

Keterangan tetap terlihat di kartu sampai absen berikutnya (mis. setelah absen pulang tampil keterangan untuk pulang).

## 6. Output yang Diharapkan
1. Empat halaman/area di atas, desktop 1440px + mobile 390px (portal: mobile saja), high fidelity, data contoh realistis, beserta semua state yang disebut (empty, skeleton, dialog, state tombol lokasi, error validasi, tampilan atasan, state kartu portal).
2. **Komponen baru beserta variannya** (nama berdasarkan peran, bisa dipetakan ke Tailwind v4 `@theme` yang sudah ada): kartu/baris lokasi, input koordinat + tombol "Pakai lokasi saya" (5 state), input angka bersatuan (m), badge tanda absen (generik per jenis) + baris rincian, badge keputusan tinjauan, dialog keputusan dengan catatan, keterangan lokasi di kartu absen portal, section "Pengaturan absen" (baca/ubah).
3. Pakai ulang token yang sudah ada; jika butuh token baru, sebutkan eksplisit.
4. Semua bisa diimplementasikan dengan CSS standar + Tailwind v4.
