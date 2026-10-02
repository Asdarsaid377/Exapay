# UI Tokens

Design tokens project ini. Semua warna, typography, spacing, dan nilai component diekstrak dari desain di `context/designs/`. **Tema saat ini mengacu https://solvexaerp.tech/ (permintaan user, 2026-09-30)** — oranye hangat, latar krem, teks cokelat tua. Pakai nilai persis dari sini — jangan hardcode warna atau memakai kelas warna bawaan Tailwind di component.

> **TEMPLATE:** Ganti seluruh nilai hex di bawah dengan nilai dari desain aktual project. Struktur token dipertahankan agar kelas utility konsisten antar project.

---

## Cara Pakai

Project ini memakai **Tailwind CSS v4**. Semua token didefinisikan dengan directive `@theme` di `apps/web/app/globals.css`. Tailwind v4 otomatis menghasilkan utility class dari variabel `@theme`:

- `--color-accent` → `bg-accent`, `text-accent`, `border-accent`
- `--color-surface` → `bg-surface`, `text-surface`, `border-surface`

```tsx
// Benar — pakai utility class hasil generate
className="bg-surface text-text-primary border-border"

// Jangan — hardcode hex
className="bg-[#FBF8F3] text-[#221208]"

// Jangan — kelas warna bawaan Tailwind
className="bg-purple-500 text-gray-600"
```

---

## Status Tema

- **Tema aktif: Glassmorphism** — dari `context/designs/design-tokens.html`, `dashboard.html`, `me.html` (Claude Design, 2026-09-30). **Sudah diterapkan** di `apps/web/app/globals.css` (redesign 2026-09-30) beserta semua component di `ui-registry.md`.
- `globals.css` adalah definisi yang berlaku; tabel di bawah = nilai & pemetaan nama. Tema lama (solid) dicatat di "Riwayat Token".

---

## Tema Glassmorphism — Token Target

Nilai persis dari `context/designs/design-tokens.html`. Nama mengikuti desain; kolom "Token lama" = pemetaan saat redesign (nama lama dipertahankan jika perannya sama agar kelas di component tidak perlu diganti semua).

### Warna

| Token (desain) | Nilai | Token lama | Pemakaian |
| --- | --- | --- | --- |
| `accent` | `#F2790F` | `accent` | Tombol primer, grafik, tab aktif |
| `accent-hover` | `#D9600A` | `accent-hover` | Hover/pressed tombol primer |
| `accent-text` | `#B34C08` | `accent-strong` | Tautan & teks beraksen (5,3:1) |
| `accent-tint` | `rgb(242 121 15 / 0.16)` | `accent-soft` (#fff3e9 → tint transparan) | Latar item aktif (sidebar, bottom nav). Varian `/0.10–0.12`: hover dropdown, sub-menu aktif |
| `canvas` | `#FBF8F3` | `background` | Latar aplikasi (krem) |
| `shape-peach` | `#F7D3B3` | — (baru) | Bentuk latar besar |
| `shape-apricot` | `#F6B27A` | — (baru) | Bentuk latar aksen |
| `shape-sand` | `#EADCCB` | — (baru) | Bentuk latar netral |
| `shape-cream` | `#FAE0C8` | — (baru; dipakai di desain, tidak ada di daftar token) | Bentuk latar lembut |
| `text-primary` | `#221208` | `text-primary` | Judul, angka, teks utama; **juga teks tombol primer** |
| `text-secondary` | `#5B4636` | `text-secondary` | Teks pendukung (≥7:1) |
| `text-tertiary` | `#75604D` | — (baru) | Caption & label kecil (≥5:1) — pengganti `text-muted` untuk teks |
| `text-muted` | `#8A7561` | `text-muted` | **Hanya** placeholder, disabled, ikon non-esensial (±4,1:1) |
| `success` / `success-text` | `#15803D` / `#166534` | `success` (+ baru `-text`) | Disetujui, tepat waktu |
| `warning` / `warning-text` | `#D97706` / `#92400E` | `warning` (+ baru `-text`) | Isian/ikon peringatan; teks pakai `-text` |
| `danger` / `danger-text` | `#DC2626` / `#B91C1C` | `danger` (+ baru `-text`) | Ditolak, alpa, Keluar |
| `info` / `info-text` | `#2563EB` / `#1D4ED8` | `info` (+ baru `-text`) | Informasi netral, badge Final |
| `inverse` / `on-inverse` | `#221208` / `#FBF8F3` | `inverse` / `on-inverse` | Avatar, badge hitungan, tombol "Absen Pulang" |

Tint status (badge, alert): latar = warna status dengan alpha 0.10–0.16, teks = `*-text`. Lihat Badge di bawah.

### Permukaan kaca

| Token | Latar | Blur | Border | Shadow | Pemakaian |
| --- | --- | --- | --- | --- | --- |
| `surface-glass-strong` | `rgb(255 253 249 / 0.80)` (card konten 0.78) | 24px + `saturate(1.2)` | `border-glass-strong` | `shadow-glass-lg` | Angka uang, stat tile, grafik, kartu absen |
| `surface-glass` | `rgb(255 251 245 / 0.60)` | 20px + `saturate(1.2)` | `border-glass` | `shadow-glass` | Sidebar, header, panel sekunder |
| `surface-glass-overlay` | `rgb(255 253 249 / 0.90)` | 24px | `rgb(255 255 255 / 0.80)` | `shadow-overlay` | Dropdown, drawer (drawer 0.84), modal |
| `surface-solid` | `#FFFDF9` | tanpa | `rgb(34 18 8 / 0.07)` | `0 8px 24px -16px rgb(74 42 16 / 0.2)` | Kartu sekunder portal + fallback `@supports not (backdrop-filter)` |

- Border kaca: `border-glass` `rgb(255 255 255 / 0.60)`, `border-glass-strong` `rgb(255 255 255 / 0.75)`, `border-subtle` `rgb(34 18 8 / 0.08)` (garis pemisah, legenda). Border kontrol (input, tombol secondary): `rgb(34 18 8 / 0.14)`, hover `0.24`
- Hover item di atas kaca: `rgb(255 255 255 / 0.62)`
- Blur: `blur-glass-sm` 16px · `blur-glass` 20px · `blur-glass-lg` 24px (portal: 18px)
- Shadow: `shadow-glass` `0 1px 2px rgb(74 42 16 / .05), 0 10px 30px -12px rgb(74 42 16 / .14)` · `shadow-glass-lg` `0 1px 2px rgb(74 42 16 / .06), 0 16px 40px -14px rgb(74 42 16 / .20)` · `shadow-overlay` `0 20px 50px -16px rgb(74 42 16 / .30)`
- Focus ring: 3px `rgb(242 121 15 / 0.45)` (tombol), `0 0 0 3px rgb(242 121 15 / 0.28)` + border accent (input)

### Radius, spacing, tipografi

- Radius: `inner` 12px (item di dalam card/dropdown) · `field` 14px · `card` 22px (card portal 20–24px) · `sheet` 26–28px (drawer, frame) · `pill` 9999px (tombol, badge)
- Spacing basis 4: gap grid 16–20px, padding card 20–24px, `touch-min` 44px
- Tipografi (Plus Jakarta Sans = J, DM Sans = D):

| Token | Spesifikasi | Contoh |
| --- | --- | --- |
| `text-display` | J 800 · 68/0.95 · -0.04em · tabular | Jam absen "07:52" |
| `text-h1` | J 800 · 30/1.15 · -0.025em (mobile 24/1.2) | "Selamat pagi, Budi" |
| `text-num` | J 800 · 32/1 · -0.02em · tabular (mobile 26) | "68.450.000" (prefix "Rp" J 700 17px) |
| `text-h2` | J 700 · 17/1.3 · -0.01em | Judul card "Tindakan tertunda" |
| `text-body-strong` | D 700 · 15/1.4 | Judul baris daftar |
| `text-body` | D 400 · 15/1.5 | Teks utama (naik dari 14px) |
| `text-small` | D 400 · 13.5/1.4 | Sub-teks baris |
| `text-caption` | D 400/700 · 12.5/1.3 | Tanggal, badge |

Tombol memakai **Plus Jakarta Sans 700 14px** (bukan DM Sans).

### Warna grafik (dari dashboard.html — tidak ada di daftar token desain)

| Token (usulan) | Nilai | Pemakaian |
| --- | --- | --- |
| `chart-present` | `#F2790F` | Hadir |
| `chart-late` | `#7A3A0A` | Telat |
| `chart-leave` | `#D8C3AA` | Izin/sakit/cuti |
| `chart-absent` | `#DC2626` | Alpa |
| `chart-track` | `rgb(34 18 8 / 0.07)` | Latar progress bar |

Predikat KPI: Sangat Baik `success`, Baik `accent`, Cukup `warning`, Perlu Perbaikan `danger`.

### Alert peringatan (banner UMK)

Latar `rgb(255 247 237 / 0.88)` + blur 20px, border `rgb(217 119 6 / 0.35)`, ikon `#B45309`, radius 18px.

### `@theme` usulan desain (acuan saat implementasi)

Salinan dari `design-tokens.html`. Saat diterapkan: sesuaikan nama dengan kolom "Token lama" di atas, tambah `shape-cream`, `chart-*`, dan font lewat variabel `next/font` (`var(--font-jakarta)`, `var(--font-dm-sans)`) seperti sekarang. Verifikasi namespace Tailwind v4 (`--blur-*`, `--text-*--line-height`) ke dokumentasi terpasang sebelum dipakai.

```css
@theme {
  --color-accent: #F2790F;
  --color-accent-hover: #D9600A;
  --color-accent-text: #B34C08;
  --color-accent-tint: rgb(242 121 15 / 0.16);
  --color-canvas: #FBF8F3;
  --color-shape-peach: #F7D3B3;
  --color-shape-apricot: #F6B27A;
  --color-shape-sand: #EADCCB;
  --color-text-primary: #221208;
  --color-text-secondary: #5B4636;
  --color-text-tertiary: #75604D;
  --color-text-muted: #8A7561;
  --color-success: #15803D;  --color-success-text: #166534;
  --color-warning: #D97706;  --color-warning-text: #92400E;
  --color-danger: #DC2626;   --color-danger-text: #B91C1C;
  --color-info: #2563EB;     --color-info-text: #1D4ED8;

  --color-surface-glass-strong: rgb(255 253 249 / 0.80);
  --color-surface-glass: rgb(255 251 245 / 0.60);
  --color-surface-glass-overlay: rgb(255 253 249 / 0.90);
  --color-surface-solid: #FFFDF9;
  --color-border-glass: rgb(255 255 255 / 0.60);
  --color-border-glass-strong: rgb(255 255 255 / 0.75);
  --color-border-subtle: rgb(34 18 8 / 0.08);

  --blur-glass-sm: 16px;
  --blur-glass: 20px;
  --blur-glass-lg: 24px;

  --radius-inner: 12px;
  --radius-field: 14px;
  --radius-card: 22px;
  --radius-sheet: 28px;

  --shadow-glass: 0 1px 2px rgb(74 42 16 / 0.05), 0 10px 30px -12px rgb(74 42 16 / 0.14);
  --shadow-glass-lg: 0 1px 2px rgb(74 42 16 / 0.06), 0 16px 40px -14px rgb(74 42 16 / 0.20);
  --shadow-overlay: 0 20px 50px -16px rgb(74 42 16 / 0.30);

  --text-display: 68px;   --text-display--line-height: 0.95;
  --text-h1: 30px;        --text-h1--line-height: 1.15;
  --text-num: 32px;       --text-num--line-height: 1;
  --text-h2: 17px;        --text-h2--line-height: 1.3;
  --text-body: 15px;      --text-body--line-height: 1.5;
  --text-small: 13.5px;   --text-small--line-height: 1.4;
  --text-caption: 12.5px; --text-caption--line-height: 1.3;
}

@utility glass {
  background: var(--color-surface-glass);
  backdrop-filter: blur(var(--blur-glass)) saturate(1.2);
  border: 1px solid var(--color-border-glass);
  box-shadow: var(--shadow-glass);
}
@utility glass-strong {
  background: var(--color-surface-glass-strong);
  backdrop-filter: blur(var(--blur-glass-lg)) saturate(1.2);
  border: 1px solid var(--color-border-glass-strong);
  box-shadow: var(--shadow-glass-lg);
}
@supports not (backdrop-filter: blur(1px)) {
  .glass, .glass-strong { background: var(--color-surface-solid); }
}
```

---

## Nama Token di Kode (globals.css)

Nama desain yang perannya sama dengan token lama **tetap memakai nama lama** di kode:

| Desain | Kelas di kode |
| --- | --- |
| `canvas` | `bg-background` |
| `accent-text` | `text-accent-strong` |
| `accent-tint` | `bg-accent-soft` (varian `bg-accent/10`, `bg-accent/12`) |
| teks tombol primer | `text-on-accent` (= #221208) |
| `*-text` status | `text-success-text`, `text-warning-text`, `text-danger-text`, `text-info-text` |
| tint status | `bg-success-soft`, `bg-warning-soft`, `bg-danger-soft`, `bg-info-soft` |

Token tambahan di kode (nilai dari snapshot, tidak bernama di daftar token desain): `shape-cream`, `glass-hover` (`rgb(255 255 255 / .62)`), `control` (latar input/tombol secondary `rgb(255 255 255 / .8)`), `fill-subtle` / `fill` (`rgb(34 18 8 / .04 / .08)` — panel detail, skeleton, disabled), `border-control` / `border-control-hover` (`rgb(34 18 8 / .14 / .24)`), `accent-deep` (#8A3A06), `inverse-hover` (#3A2415), `warning-icon` (#B45309), `warning-border`, `warning-surface`, `chart-*`, `shadow-solid`, `shadow-drawer`.

Token halaman Karyawan (feature 11, design-tokens.html "Komponen baru — halaman Karyawan"): `surface-glass-data` (`rgb(255 253 249 / .86)` — tabel/daftar data), `table-head` (`rgb(34 18 8 / .035)`), `row-hover` (`rgb(242 121 15 / .07)`), `segment-track` (`rgb(34 18 8 / .06)`), `neutral-text` (#3D2A1C, badge netral), `border-neutral` (16%, banner netral), `border-outline` (20%, badge outline), `danger-surface`, `danger-border`, `on-danger` (#fff, tombol bahaya 4,8:1), `shadow-segment`. Token desain `border-strong` (14%) = `border-control` yang sudah ada; `shadow-dialog`/`scrim` tidak ditambah (Dialog sudah punya gaya sendiri).

Utilitas (`@utility` di globals.css): `glass`, `glass-strong`, `glass-data` (tabel & daftar data), `glass-overlay`, `surface-solid`, `animate-exa-pulse`. Fallback solid otomatis untuk browser tanpa `backdrop-filter` dan `prefers-reduced-transparency: reduce`.

Token tema lama yang **dihapus**: `surface`, `surface-secondary`, `border`, `border-strong`, `shadow-card`, `shadow-accent`.

---

## Batasan Pemakaian Token (preferensi user)

- Tint accent/status **hanya** untuk badge teks (tanpa titik), item aktif, dan alert — tidak untuk badge/pill ber-dot dekoratif ("AI slop")
- Tint accent untuk kotak ikon hanya jika ikonnya fungsional (status/aksi), bukan hiasan per baris daftar fitur
- Blur **hanya** sebagai efek permukaan kaca (`surface-glass*`) — tidak ada token gradient/glow, sengaja. Detail: `ui-rules.md` bagian "Gaya yang Ditolak User"
- Teks kecil sekunder pakai `text-tertiary`, bukan `text-muted`

---

## Aturan Penambahan Token

1. Token baru hanya ditambahkan jika muncul di desain dan belum bisa diwakili token yang ada
2. Nama token mendeskripsikan **peran**, bukan warna — `--color-danger`, bukan `--color-red`
3. Setiap token baru dicatat di file ini beserta konteks pemakaiannya
4. Jangan pernah menambah warna langsung di component tanpa lewat token

---

## Riwayat Token

- 2026-09-30 — `--color-on-accent` (#ffffff): teks putih tombol primary sesuai `ui-rules.md` (feature 04). Pengganti `text-white` bawaan Tailwind.
- 2026-09-30 — **Tema diganti** mengikuti solvexaerp.tech (nilai diekstrak dari computed style situs): accent `#f2790f`, background krem `#fbf8f3`, teks cokelat `#221208/#5b4636/#8a7561`, border hangat. Token baru: `--color-accent-strong` (#b34c08 — tautan/teks beraksen, kontras 5.5:1), `--color-border-strong` (tombol secondary), `--color-inverse`/`--color-on-inverse` (panel gelap), `--font-display` (Plus Jakarta Sans), `--radius-card` 22px, `--radius-field` 14px, `--shadow-card`, `--shadow-accent`. Font teks: DM Sans. Warna status disesuaikan agar `warning` tidak bertabrakan dengan accent oranye
- 2026-09-30 — **Tema Glassmorphism** ditetapkan sebagai acuan (Claude Design, snapshot `context/designs/design-tokens.html`). Token baru: `accent-tint`, `canvas`, `shape-*`, `text-tertiary`, `*-text` per status, `surface-glass*`, `surface-solid`, `border-glass*`, `border-subtle`, `blur-glass*`, `radius-inner`, `radius-sheet`, `shadow-glass*`, `shadow-overlay`, skala `text-*`; usulan `chart-*`. **Teks tombol primer berubah ke `text-primary` (#221208, 6,6:1)** menggantikan putih (2,8:1). Diterapkan di `globals.css` pada redesign 2026-09-30 (tema lama: background/surface solid #fff, border #f3e5d9/#ecd6c6, shadow-card, shadow-accent, teks tombol putih)
- **Catatan aksesibilitas:** teks putih di atas `--color-accent` hanya ±2.8:1 (di bawah WCAG AA 4.5:1) — dipertahankan sesuai referensi untuk tombol (teks tebal). Jangan pakai `text-accent` untuk teks kecil di latar terang; pakai `text-accent-strong`
- 2026-09-30 — **Halaman Karyawan (feature 11)**: token `surface-glass-data`, `table-head`, `row-hover`, `segment-track`, `neutral-text`, `border-neutral`, `border-outline`, `danger-surface`, `danger-border`, `on-danger`, `shadow-segment` + utilitas `glass-data`. Badge `neutral` disesuaikan ke desain (latar 7% + `neutral-text`, sebelumnya 6% + `text-secondary`).
- 2026-10-02 — **Landing page `/` (feature 43, snapshot `context/designs/landing.html`)**: skala tipografi marketing `text-hero` (64/1.04, mobile `text-hero-sm` 38), `text-section` (44/1.1, mobile `text-section-sm` 30), `text-feature` (30) & `text-feature-lg` (40, blok KPI), `text-step` (96, angka langkah; mobile 64), `text-price` (56), `text-lead` (19, sub-judul hero) — semua J 800 kecuali lead; tracking ikut token. Tata letak: `--container-landing` 1200px (`max-w-landing`), `--container-intro` 640px (`max-w-intro`, dinamai `intro` karena `max-w-prose` bawaan Tailwind), `--spacing-section` 128px / `--spacing-section-sm` 72px (`pb-section`/`pb-section-sm`), `--radius-device` 40px (bingkai HP). Usulan desain `color-device-bezel`, `color-divider-strong`, `color-cta-body` **tidak ditambahkan** — sama dengan `inverse`, `text-primary`, `neutral-text`. Hanya dipakai di landing page.
- 2026-10-03 — **Selfie absen (feature 45, snapshot `context/designs/selfie-components.html`)**: `camera-bg` (#160C05 — latar layar kamera; gelap agar pratinjau akurat & layar tidak menyilaukan wajah, turunan ink), `camera-preview` (#3A2B20 — area `<video>` sebelum stream tampil), `camera-guide` (`rgb(255 253 249 / .6)` — garis oval panduan 2px, statis), `photo-placeholder` (#DCCFC0 — isi thumbnail/foto saat memuat, netral). Teks di atas kamera: `on-camera` (#FBF8F3) & `on-camera-muted` (#CDBFB1) — nilai dari snapshot, AA di atas `camera-bg`/`camera-preview`. Hanya dipakai di komponen selfie.
