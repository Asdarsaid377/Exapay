# Video promosi Exapay (Story / Reels / TikTok)

Empat video vertikal 1080×1920, 30 fps, H.264 + AAC, dirender oleh script. Tidak ada langkah manual di editor video, dan render ulang tidak butuh AI.

| File | Durasi | Isi |
| --- | --- | --- |
| `out/exapay-story-15s.mp4` | 15 s | Hook → logo + headline → Payroll → Absensi → Skor kinerja → CTA |
| `out/exapay-story-30s.mp4` | 30 s | Hook → logo → Gaji otomatis → Slip ke email + Excel → Absen selfie → Izin & cuti → Verifikasi tugas → Skor kinerja → AI ringkasan kinerja → Pengingat kepatuhan → Portal karyawan → CTA (12 bar × 2,5 s) |
| `out/exapay-story-42s.mp4` | 42,5 s | Isi sama dengan versi 30 s, tiap fitur dan CTA 3,75 s (6 ketukan) agar sempat dibaca. Animasi selesai ±1,9 s, sisanya layar diam |
| `out/exapay-short-5s.mp4` | 5 s | Logo → Payroll → CTA |

## Render ulang

Butuh Node 22+, ffmpeg, dan Google Chrome (dipakai lewat `puppeteer-core`; Chromium tidak ikut diunduh).

```bash
cd marketing/video
pnpm install --ignore-workspace   # sekali saja; folder ini sengaja di luar pnpm workspace
pnpm render                       # render keempat video ke out/ (±2 menit)
```

## Opsi

| Opsi | Fungsi |
| --- | --- |
| `--video story\|long\|extended\|short\|all` | Video yang dirender (bawaan `all`; `long` = 30 s, `extended` = 42,5 s) |
| `--still 1.5 --still 6` atau `--still 1.5,6` | Simpan frame PNG di detik tertentu ke `out/stills/` (tanpa MP4), plus contact sheet bila lebih dari satu |
| `--sheet` | Frame kunci tiap scene + contact sheet `out/stills/<video>_sheet.png` |
| `--no-safe-zone` | Pratinjau tanpa garis zona aman (bawaan: garis merah putus-putus di y=250 & y=1580 + label waktu) |
| `--cta "..."` | Teks tombol ajakan (bawaan "Coba gratis 30 hari") |
| `--fine "..."` | Baris kecil di bawah tombol (bawaan "Tanpa kartu kredit · Data tetap milik Anda") |
| `--price "..."`, `--price-unit "..."`, `--price-prefix "..."` | Harga di CTA (bawaan "Hanya" / "Rp10.000" / "per karyawan / bulan"; `--price-prefix ""` menghilangkan "Hanya") |
| `--url "..."` | URL di akhir video (bawaan "hr.solvexaerp.tech") |
| `--out DIR` | Folder hasil (bawaan `out/`) |
| `--chrome PATH` | Lokasi Chrome bila bukan di `/Applications` (atau env `CHROME_PATH`) |

Contoh: `pnpm render --video short --cta "Daftar gratis sekarang"`.

Setiap render penuh mencetak hasil ffprobe (durasi, resolusi, codec, stream audio) dan `volumedetect` (mean/max). Script juga membuat `out/check/<video>_transitions.png`, yaitu frame 0,1 s sebelum dan sesudah setiap pergantian scene yang diambil dari MP4.

## Cara kerja

1. **Mockup asli.** `src/mockups.tsx` merender komponen landing (`HeroPreview`, `KpiPreview`, `SlipPreview`, `ComplianceRemindersPreview`, `PortalPreview` di `apps/web/components/landing`) ke HTML statis. Kalau tampilan landing berubah, video ikut berubah saat dirender ulang. Layar yang belum punya mockup landing (kamera selfie, persetujuan cuti, verifikasi tugas, ringkasan AI) disusun di `scene.js` dari kelas dan label komponen app aslinya: `selfie/SelfieCamera`, `attendance/LeaveRequestTable`, `tasks/TaskVerificationRow`, `kpi/KpiReviewSummaryPanel`. Kamera selfie memakai siluet netral, bukan foto orang.
2. **Token asli.** `apps/web/app/globals.css` disalin ke `build/theme.css` lalu dikompilasi Tailwind v4 bersama `src/styles.css`. Tidak ada palet baru.
3. **Scene.** `src/scene.js` menyusun scene, lalu `window.__render(t)` menghitung posisi, skala, dan opacity setiap frame dengan easing out-cubic atau out-back, ditambah gerak melayang sinus kecil. Tidak ada animasi CSS, jadi hasilnya deterministik.
4. **Frame.** Chrome headless mengambil screenshot setiap frame dan mem-pipe-nya ke ffmpeg (libx264 CRF 18, yuv420p).
5. **Audio.** Musik dipotong mulai downbeat, diregangkan ke 96 BPM, diatur volume 50%, fade in 0,3 s dan fade out 0,8 s. SFX ditempatkan dengan `adelay`, lalu dicampur `amix` dan `alimiter` (batas -1,4 dBFS) dan dikodekan AAC 192 kbps.

Waktu scene dan efek suara diatur di satu tempat, yaitu `src/timeline.mjs`.

**Sinkron ketukan.** Tempo musik terukur 97,47 BPM, dari jarak snare dua-ketukan antara 0,7 s dan 44 s dengan residu ±20 ms. Downbeat pertama ada di 0,116 s. `atempo = 96/97,47` (melambat 1,5%, nada tetap) membuat 1 bar = 2,5 s, sehingga pergantian scene di 2,5 / 5 / 7,5 / 10 / 12,5 s jatuh di awal bar. Aksen animasi (pil, Final, tombol absen, badge Baik, tombol CTA) jatuh di ketukan (kelipatan 0,625 s).

## Zona aman & aturan desain

- Semua teks penting berada di antara y=250 dan y=1580 (250 px atas dan 340 px bawah tertutup UI Instagram).
- Judul 72 px, sub 40 px, teks CTA 38–64 px. Font: Plus Jakarta Sans (judul) dan DM Sans (badan).
- Teks di atas `accent` memakai `on-accent` `#221208`, bukan putih.

## Logo

Sumbernya `apps/web/public/exapaylogo.png` (2000×2000, latar putih). Setiap render, `src/logo.mjs` membuang latar putih dengan "color-to-alpha" dua warna. Setiap piksel tepi diberi warna logo murni (abu `#494949` atau orange `#FF800D`) dan alpha sesuai tingkat campurannya dengan putih, jadi tepinya halus tanpa halo putih. Logo lalu dipotong ke batasnya dan dipecah jadi tiga lapis untuk animasi: ikon sapuan orange, huruf é, dan tulisan "Exapay". Kalau logo di `public/` diganti, cukup render ulang. Untuk mengambil PNG transparannya saja: `node src/logo.mjs ../../apps/web/public/exapaylogo.png out/logo`.

Catatan: warna orange logo (`#FF800D`) sedikit berbeda dari token `accent` (`#F2790F`), dan abu huruf é (`#494949`) bukan token `text-primary`. Video memakai warna asli logo.

## Data di layar

Semua data **fiktif** dan sama dengan data demo landing page: Kopi Nusantara (Pettarani), Dimas Pratama (Rp 6.799.097), Rina Wulandari (Rp 3.952.400, skor KPI 86 "Baik"), Agus Pratama (Rp 3.610.000), total Rp 48.215.400 untuk 15 karyawan. Tidak ada screenshot dari app yang berjalan dan tidak ada data pelanggan.

Klaim di video mengikuti fitur yang ada di app dan landing page (`apps/web/lib/landingContent.ts`). Keputusan pemilik pada 2026-10-08:
- Scene AI berjudul "AI bantu Anda menilai kinerja": AI menulis ringkasan, skor tetap dari rumus, tanpa kalimat tinjauan atasan.
- Absensi ditampilkan dengan selfie, tanpa kalimat "jam server".
- Harga ditulis "Hanya Rp10.000 per karyawan / bulan", tanpa minimum 5 karyawan.

Harga dan trial sesuai data harga awal di migration `billing_prices`. Isi ringkasan AI di video memakai angka indikator KPI demo yang sama (42/40 cup, 26/30 hari).

## Aset & lisensi

| Aset | Sumber | Lisensi | Diunduh |
| --- | --- | --- | --- |
| Musik: *Acoustic Corporate Startup Promo Short Cut*, Alex Morgan (album *Corporate Business Vol. 1*), 96 BPM, ditandai AI-generated oleh pengunggah | https://freemusicarchive.org/music/alex-morgan/corporate-business-vol-1-vol-1/acoustic-corporate-startup-promo-short-cut/ | **CC BY 4.0**: boleh komersial, **wajib kredit**, mis. di caption: *Music: "Acoustic Corporate Startup Promo Short Cut" by Alex Morgan, CC BY 4.0* | 2026-10-08 |
| SFX: Kenney *Interface Sounds* 1.0 (`click_002`, `tick_002`, `confirmation_002`, `confirmation_004`, `pluck_002`, `maximize_006`, `glass_002`) | https://kenney.nl/assets/interface-sounds | CC0 (`assets/audio/sfx/LICENSE-kenney-interface-sounds.txt`) | 2026-10-08 |
| Font: Plus Jakarta Sans (variable) | https://github.com/google/fonts/tree/main/ofl/plusjakartasans | SIL OFL 1.1 (`assets/fonts/OFL-PlusJakartaSans.txt`) | 2026-10-08 |
| Font: DM Sans (variable) | https://github.com/google/fonts/tree/main/ofl/dmsans | SIL OFL 1.1 (`assets/fonts/OFL-DMSans.txt`) | 2026-10-08 |

Teks lengkap CC BY 4.0: https://creativecommons.org/licenses/by/4.0/legalcode. Ringkasan lisensi musik dan perubahan yang dilakukan: `assets/audio/music/LICENSE-alex-morgan-acoustic-corporate-startup-promo-short-cut.txt`.

## Struktur

```
marketing/video/
├── package.json          dependensi render (terpisah dari workspace & bundle produksi)
├── src/
│   ├── render.mjs        CLI: build scene → frame Chrome → ffmpeg → audio → verifikasi
│   ├── timeline.mjs      durasi scene, waktu kunci, cue SFX, musik, teks bawaan
│   ├── scene.js          scene & animasi (berjalan di Chrome)
│   ├── mockups.tsx       komponen landing asli → HTML
│   ├── logo.mjs          logo public/exapaylogo.png → PNG transparan 3 lapis
│   └── styles.css        entry Tailwind (token dari apps/web)
├── assets/fonts, assets/audio
├── build/                hasil antara (diabaikan git)
└── out/                  MP4 + pratinjau (diabaikan git)
```
