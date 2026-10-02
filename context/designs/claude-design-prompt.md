# Prompt Claude Design — Selfie Absen

_Disusun 2026-10-03 untuk feature 45. Salin seluruh isi di bawah garis ke Claude Design **di project/percakapan yang sama dengan desain glassmorphism & geofence sebelumnya** (agar token & komponen dipakai ulang), lalu kirim link hasilnya (atau export zip ke `context/designs/`) ke Claude Code (lihat `../ui-workflow.md` "Jalur Claude Design"). Prompt sebelumnya (lokasi kerja & tinjauan absensi, feature 44) ada di riwayat git._

---

# Brief Desain UI — Exapay: Selfie Absen

## 1. Konteks
Lanjutan dari desain **Exapay tema Glassmorphism** yang sudah disetujui (Dashboard owner, Portal `/me`, Design token, halaman Karyawan) dan desain **Lokasi Kerja & Tinjauan Absensi** (geofence). **Pakai ulang persis** token, sidebar, header, card kaca, tombol pill, input, badge, segmented control, data-table kaca, form-section 2 kolom, read-field, banner, dialog/sheet, **kartu absen portal + keterangan lokasi**, **section "Pengaturan absen"**, **badge tanda absen**, dan **dialog keputusan tinjauan** dari desain itu. Gaya baru hanya untuk pola yang belum ada (lihat bagian 5).

Exapay: SaaS yang membantu tugas HRD di **UMKM Indonesia, karyawan < 50 orang**, tanpa staf HR. Semua teks **Bahasa Indonesia**, nada lugas. Tanggal contoh `5 Okt 2026`, zona waktu **WITA**.

Ringkasan token: aksen oranye `#F2790F` (hover `#D9600A`, teks aksen `#B34C08`), latar krem `#FBF8F3` dengan bentuk warna flat lembut, teks `#221208` / `#5B4636` / `#8A7561`, sukses `#15803D`, peringatan `#D97706`, bahaya `#DC2626`, info `#2563EB`. Font Plus Jakarta Sans (judul) + DM Sans (teks). Card kaca radius 22px, field 14px, tombol pill; **teks tombol primer `#221208`** (bukan putih).

## 2. Fitur yang Didesain
**Selfie saat absen sebagai bukti kehadiran.** Karyawan yang diwajibkan selfie mengambil foto wajah dengan **kamera depan langsung di aplikasi** (tidak bisa memilih dari galeri) setiap absen masuk dan pulang.

- **Wajib selfie** diatur per karyawan oleh pemilik/admin, **default aktif** untuk semua karyawan.
- Karyawan wajib selfie **tidak bisa absen tanpa foto**. Jam absen = jam server saat absen diterima (bukan saat foto diambil).
- Foto **dikompres di HP** (±100 KB) lalu dikirim bersama absen. Jika gagal terkirim (sinyal buruk), foto tetap di HP dan ada tombol **"Coba lagi"**.
- **Hanya bukti — tanpa pengenalan wajah.** Tidak ada pencocokan wajah, skor kemiripan, atau deteksi otomatis apa pun. Jangan desain indikator "wajah terdeteksi"/"cocok".
- Foto **disimpan 90 hari**, lalu dihapus otomatis. Absen setelah itu tetap tercatat, fotonya tampil sebagai "Foto sudah dihapus".
- Pemberitahuan **sekali di awal** (sebelum selfie pertama): foto dipakai sebagai bukti kehadiran, hanya dilihat pemilik/admin dan atasan langsung, disimpan 90 hari.
- Koreksi absensi oleh admin **tidak butuh selfie**.
- Selfie berdiri bersama fitur lokasi (geofence) yang sudah ada: satu absen bisa punya selfie **dan** keterangan lokasi.

## 3. Peran — siapa melihat foto
- **Pemilik & Admin:** atur "Wajib selfie" per karyawan; lihat foto semua karyawan di rekap/koreksi absensi dan antrean tinjauan.
- **Atasan:** lihat foto **bawahan langsung** saja (rincian absensi & antrean tinjauan). Pengaturan hanya bisa dibaca.
- **Karyawan:** ambil selfie saat absen; lihat foto **miliknya sendiri** di riwayat absensi portal.

## 4. Batasan (WAJIB — preferensi user)
- Tanpa gradient warna-warni (termasuk mesh), tanpa glow/pendar. Blur hanya untuk panel kaca.
- **Tanpa badge/pill ber-titik (dot)**, tanpa eyebrow label warna-warni, tanpa titik dekoratif.
- **Tanpa ikon hiasan dalam kotak/lingkaran per baris.** Ikon hanya untuk aksi, status, atau navigasi; satu ikon per konteks.
- Tanpa ilustrasi wajah/kartun dekoratif. **Foto contoh pakai placeholder netral** (kotak warna `fill-subtle` atau image slot), bukan foto orang sungguhan.
- Tampilan kamera: boleh bingkai panduan sederhana (garis oval/rounded tipis berwarna netral) agar wajah pas di tengah — **tanpa** efek pemindaian, garis laser, animasi deteksi, atau tanda centang otomatis.
- Maksimal 2 level radius bersarang. Satu font weight per elemen. Kontras teks di atas kaca WCAG AA. Jam absen di permukaan paling solid.
- Hanya efek yang bisa dibuat dengan CSS standar (kamera = elemen `<video>` biasa).

## 5. Yang Didesain Sekarang
Usaha **Kopi Nusantara** (Kota Makassar). Karyawan contoh **Dewi Lestari** (Barista), atasan **Rudi Hartono**, pemilik **Budi Santoso**.

### Area 1 — Portal karyawan `/me` (kartu absen + alur selfie) — mobile 390px saja
Pakai kartu absen portal yang sudah ada (dengan keterangan lokasi feature sebelumnya). Tunjukkan state:

1. **Sebelum absen, wajib selfie:** tombol "Absen masuk" + teks kecil di bawahnya "Absen memakai selfie sebagai bukti kehadiran." (gabung dengan teks lokasi bila usaha memakai lokasi — maksimal dua baris keterangan, jangan bertumpuk banyak).
2. **Pemberitahuan pertama kali** (sheet dari bawah, muncul sebelum kamera dibuka untuk selfie pertama): judul "Selfie untuk bukti kehadiran"; poin singkat: foto diambil setiap absen masuk & pulang; hanya dilihat pemilik/admin dan atasan langsung; disimpan 90 hari lalu dihapus otomatis; tidak dipakai untuk pengenalan wajah. Tombol primer "Mengerti, buka kamera" + sekunder "Nanti".
3. **Kamera aktif** (layar penuh/sheet penuh di HP): pratinjau kamera depan (placeholder), bingkai panduan sederhana, teks "Pastikan wajah terlihat jelas", jam server besar di atas/bawah ("07:58 WITA"), tombol rana bulat besar, tombol tutup (X). Label untuk absen masuk vs pulang ("Selfie absen masuk").
4. **Pratinjau hasil:** foto hasil + tombol **"Ulangi"** (sekunder) dan **"Kirim absen masuk"** (primer). Teks kecil "Jam absen dicatat saat dikirim."
5. **Mengirim…:** tombol kirim loading, foto tetap terlihat.
6. **Gagal kirim:** banner bahaya ringan "Absen belum terkirim — periksa sinyal internet." + tombol **"Coba lagi"** (primer) + "Ulangi foto" (teks/sekunder). Foto tetap ada.
7. **Izin kamera ditolak:** keterangan "Kamera diblokir. Izinkan akses kamera untuk Exapay di pengaturan browser, lalu coba lagi." + tombol "Coba lagi". Karyawan tidak bisa absen tanpa selfie — tambahkan teks "Tidak bisa? Hubungi admin usaha Anda."
8. **Kamera tidak tersedia / perangkat tanpa kamera depan:** pesan serupa dengan nada netral.
9. **Berhasil absen masuk:** tampilan sukses biasa ("Masuk 07:58") + **thumbnail selfie kecil** (bulat atau rounded, ±40–48 px) di samping jam; bisa dikombinasikan dengan keterangan lokasi feature sebelumnya (contoh: di luar lokasi 320 m dari Kedai Pettarani).
10. **Berhasil masuk & pulang:** dua jam (Masuk 07:58 · Pulang 17:06) masing-masing dengan thumbnail.
11. **Karyawan tidak wajib selfie:** kartu seperti sebelumnya, tanpa kamera (tampilkan singkat sebagai pembanding).

### Area 2 — Riwayat absensi portal `/me/attendance` — mobile 390px
Daftar riwayat yang sudah ada: tambahkan thumbnail selfie masuk/pulang per baris (kecil, tidak mendominasi). Ketuk → **penampil foto** (sheet/dialog): foto besar, "Selfie absen masuk · Senin, 5 Okt 2026 · 07:58 WITA", tombol tutup. State baris: foto ada · **"Foto sudah dihapus"** (lebih dari 90 hari, ikon/teks redup, tidak bisa diketuk) · tanpa selfie (tidak menampilkan apa-apa).

### Area 3 — Pengaturan absen per karyawan (section di `/employees/[id]` tab Data) — desktop 1440 + mobile 390
Section **"Pengaturan absen"** yang sudah ada (berisi "Lokasi absen") — tambahkan baris **"Wajib selfie saat absen"**.
- **Baca:** "Ya — absen masuk & pulang memakai selfie" / "Tidak".
- **Ubah** (satu mode ubah untuk seluruh section, tombol Simpan + Batal yang sudah ada): switch/toggle atau segmented **Wajib | Tidak wajib**, keterangan "Foto hanya bukti kehadiran, disimpan 90 hari. Tanpa pengenalan wajah."
- **Tampilan atasan:** hanya baca.

### Area 4 — Foto di rincian absensi (owner/admin & atasan) — desktop 1440 + mobile 390
Dipakai di **Koreksi absensi `/attendance/corrections`** (daftar harian per karyawan) dan **tab Absensi detail karyawan**. Baris harian yang ada berisi: tanggal, hari, jam masuk–pulang, badge status (Tepat waktu/Telat/Alpa/Izin/Libur), "Dikoreksi", tombol "Koreksi".
- Tambahkan **thumbnail selfie masuk & pulang** per baris (kecil, sejajar jam). Jangan membuat baris jauh lebih tinggi.
- Klik thumbnail → **dialog penampil foto** (desktop: dialog tengah; mobile: sheet): foto besar, nama karyawan, "Masuk · Senin, 5 Okt 2026 · 07:58 WITA", keterangan lokasi bila ada (pakai badge tanda absen yang sudah ada). Bila absen punya foto masuk dan pulang, boleh berpindah Masuk ↔ Pulang (segmented atau dua tab kecil).
- State thumbnail: ada · memuat (skeleton) · **gagal dimuat** ("Foto tidak dapat dibuka, coba lagi") · **sudah dihapus** (teks redup "Foto dihapus", tanpa klik) · tanpa selfie (kosong / tanda "—").
- Contoh data: 5 Okt Masuk 07:58 + foto, Pulang 17:06 + foto; 2 Jul Masuk 08:03 foto sudah dihapus; 30 Sep absen hasil koreksi admin tanpa selfie.

### Area 5 — Foto di antrean tinjauan `/attendance/review` — desktop 1440 + mobile 390
Tabel tinjauan yang sudah ada: tambahkan thumbnail selfie di kolom Karyawan atau Absen (pilih yang paling rapi). Di **dialog keputusan** ("Terima absen Rina Wulandari?"), tampilkan foto selfie absen itu (ukuran sedang) di samping/atas ringkasan absen agar peninjau bisa melihat bukti sebelum memutuskan. State: tanpa selfie (karyawan tidak wajib) & foto sudah dihapus.

## 6. Output yang Diharapkan
1. Lima area di atas dengan semua state yang disebut — portal: mobile 390px; area lain: desktop 1440px + mobile 390px. High fidelity, data contoh realistis.
2. **Komponen baru beserta variannya** (nama berdasarkan peran, bisa dipetakan ke Tailwind v4 `@theme` yang sudah ada): pemberitahuan selfie pertama kali, layar kamera selfie (aktif, pratinjau, mengirim, gagal kirim, izin ditolak, tanpa kamera), thumbnail selfie (ada, memuat, gagal, dihapus, tanpa), dialog/sheet penampil foto, baris pengaturan "Wajib selfie" (baca/ubah).
3. Pakai ulang token yang sudah ada; jika butuh token baru, sebutkan eksplisit (mis. warna latar layar kamera gelap — jelaskan alasannya).
4. Semua bisa diimplementasikan dengan CSS standar + Tailwind v4.
