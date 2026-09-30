# UI Rules

Aturan ringkas untuk membangun UI project ini. File desain di `context/designs/` adalah source of truth untuk keputusan visual — aturan di sini menutup pola dan batasan terpenting agar UI konsisten tanpa harus menspesifikasikan setiap detail.

> **Acuan aktif: Tema Glassmorphism** — snapshot Claude Design `context/designs/dashboard.html`, `me.html`, `design-tokens.html` (2026-09-30), sudah diterapkan di kode (redesign 2026-09-30). Nilai token di `ui-tokens.md`; nama kelas di kode mengikuti tabel "Nama Token di Kode" di sana (mis. `accent-soft` = accent-tint, `accent-strong` = accent-text). Halaman tanpa snapshot (mis. auth) diturunkan dari pola di bawah — cek `ui-registry.md` dulu.
---

## Font

Dua font via `next/font/google` di root layout (`apps/web/app/layout.tsx`):

- **DM Sans** → `--font-sans` (default `body`) — teks, label, item menu
- **Plus Jakarta Sans** → `--font-display` (kelas `font-display`) — judul, angka besar, wordmark, **dan teks tombol** (700); judul 700–800 dengan tracking rapat
- Angka (uang, jam, skor, hitungan) memakai `tabular-nums`

---

## Latar & Lapisan Kaca

Kaca hanya terlihat jika ada sesuatu di belakangnya, jadi setiap kerangka halaman punya **lapisan latar**:

- **Default: bentuk warna flat** di atas `canvas` (#FBF8F3) — lingkaran/rounded-rect besar `shape-peach`, `shape-apricot`, `shape-sand`, `shape-cream`, tepi tegas, `position: absolute` di wrapper `overflow-hidden`. Tanpa gradient, tanpa blur pada bentuknya
- **Opsi: foto** kerja UMKM nyata + lapisan krem rata `rgb(251 240 228 / 0.55)` (pola panel foto halaman auth)
- Tiga tingkat permukaan (nilai di `ui-tokens.md`):
  - `surface-glass` (60%, blur 20) — sidebar, header, panel sekunder
  - `surface-glass-strong` (78–80%, blur 24) — card konten, stat tile, grafik, kartu absen. **Angka uang & data penting selalu di permukaan ini atau solid**
  - `surface-glass-overlay` (90%, blur 24) — dropdown, drawer, modal
- `surface-solid` (#FFFDF9, tanpa blur) — card sekunder portal & fallback `@supports not (backdrop-filter)`
- Border kaca putih semi-transparan 1px; shadow hangat cokelat (`shadow-glass*`). Garis pemisah di dalam card `border-subtle`

---

## Layout

- **Area owner/admin/atasan (desktop):** sidebar & header adalah **panel kaca mengambang** — padding luar 20px, gap 20px, sidebar lebar 248px `rounded-card`, header tinggi 68px `rounded-card`. Konten di kolom kanan, gap antar section 16–20px
- Header: tenant switcher kiri (nama usaha J 700 15px + "Peran · Kota" 13px), kanan: tanggal hari ini (14px `text-secondary`) + avatar
- Grid dashboard: 4 stat tile; baris grafik `1.85fr / 1fr`; baris daftar 2 kolom sama
- **Mobile (<lg):** header kaca 60px `rounded-[20px]` sticky di dalam padding 12–14px (tombol menu 44px + switcher + avatar); stat tile grid 2 kolom (tile penting `col-span-2`); drawer kiri 300px `rounded-sheet` dengan overlay `inverse/32`, user card di bawah drawer
- **Portal karyawan:** lebar HP (390 acuan), padding 12–14px, header kaca 60px, bottom nav **mengambang** (inset 12px, tinggi 72px, `rounded-[24px]`), konten `pb` cukup agar tidak tertutup nav

---

## Cards

```
surface-glass-strong + backdrop-blur 24 saturate-120 + border-glass-strong + shadow-glass-lg + rounded-card (22px) + p-[22px_24px]
```

- Judul card `text-h2` (J 700 17px) + sub-teks `text-small text-secondary`; tautan aksi kanan atas (`accent-text` 700 14px, mis. "Lihat rekap")
- Daftar di dalam card: baris dipisah `border-t border-subtle` (baris pertama tanpa border), padding vertikal 13–16px
- Card di dalam card/dropdown memakai `radius-inner` (12px). Maksimal 2 level radius bersarang
- Warna masuk ke card lewat badge, bar, ikon status, dan teks — bukan pada permukaan card

---

## Hierarki Typography

| Level | Token | Spesifikasi |
| --- | --- | --- |
| Jam absen / angka hero | `text-display` | J 800 68px, -0.04em |
| Judul halaman / sapaan | `text-h1` | J 800 30px (mobile 24px), -0.025em |
| Angka stat | `text-num` | J 800 32px (mobile 26px), prefix "Rp" J 700 17px |
| Judul card / section | `text-h2` | J 700 17px |
| Label form | — | D 700 13px `text-primary` |
| Judul baris daftar | `text-body-strong` | D 700 14.5–15px |
| Body | `text-body` | D 400 15px `text-primary` / `text-secondary` |
| Sub-teks baris | `text-small` | D 400 13.5px `text-secondary` |
| Caption, tanggal | `text-caption` | D 400 12.5px `text-tertiary` |

`text-muted` (#8A7561) **tidak** untuk teks yang harus dibaca — hanya placeholder, disabled, ikon non-esensial.

---

## Buttons

- Bentuk **pill**, teks **Plus Jakarta Sans 700 14px**; tinggi 40px (desktop), 44–58px (mobile; aksi utama portal 58px J 800 17px)
- **Primary:** `bg-accent` + teks **`text-primary` (#221208)** — bukan putih (kontras 6,6:1 vs 2,8:1); hover/pressed `bg-accent-hover`; pressed `scale(0.97)`
- **Secondary:** latar `rgb(255 255 255 / 0.75)` + border `rgb(34 18 8 / 0.14)`; hover latar putih + border `0.24`
- **Gelap (aksi penutup, mis. "Absen Pulang"):** `bg-inverse text-on-inverse`, hover `#3A2415`
- **Disabled:** latar `rgb(34 18 8 / 0.08)`, teks `text-muted`
- Focus ring 3px `rgb(242 121 15 / 0.45)`
- Tautan teks: `accent-text` 700, hover `accent-hover` + underline
- Tombol ikon (menu, tutup): 44×44 `rounded-field`, hover `rgb(255 255 255 / 0.62)`

---

## Form Inputs

```
h-11 (44px) px-3.5 rounded-field border border-[rgb(34_18_8/0.14)] bg-[rgb(255_255_255/0.8)] text-[15px]
placeholder: text-muted
focus: bg-white border-accent + ring 3px rgb(242 121 15 / 0.28)
error: border-danger + pesan 12.5px danger-text
disabled/termasking: bg rgb(34 18 8 / 0.04) border-subtle teks text-tertiary (mis. "•••• •••• 4821")
```

Label D 700 13px di atas input, gap 6px.

---

## Navigasi

- **Item sidebar:** tinggi 44px (drawer 46px), `rounded-field`, px 12, gap 12, ikon 19px + label D 14.5px
  - Default: transparan, `text-primary` 500 · Hover: `rgb(255 255 255 / 0.62)` · **Aktif: `bg-accent-tint` + `accent-text` 700**
  - Grup berisi sub-menu: chevron kanan (berputar 180° saat terbuka); label grup berwarna `accent-text` jika halaman aktif ada di dalamnya
  - Sub-menu: tinggi 38px (drawer 44px), indent kiri 43px (sejajar label), `radius-inner`, D 500 14px; aktif `accent-tint/0.12` + `accent-text`
  - Hitungan tertunda: pill `bg-inverse text-on-inverse` 22px, D 700 12px (mis. KPI "7") — fungsional, bukan dekorasi
- **Bottom nav portal:** 5 item grid, item `rounded-[18px]`, ikon 22px + label D 12px; aktif `bg-accent-tint accent-text` 700, default `text-secondary` 500; pressed `scale(0.95)`
- **Dropdown (tenant switcher, menu akun):** `surface-glass-overlay` `rounded-[18px]` p-2 `shadow-overlay`; item min-h 48–52px `radius-inner`, hover `accent-tint/0.10`; item terpilih `accent-tint/0.10` + ikon Check `accent-text`; pemisah 1px `border-subtle` mx-2; "Keluar" `danger-text` 700, hover `danger/0.08`
- **Avatar:** lingkaran 40px (portal 44px) `bg-inverse text-on-inverse` J 700 14px, inisial

---

## Badge Status

Pill tinggi 24–26px, px 10–11, D 700 12.5px, latar tint 10–16% + teks gelap senada. **Tanpa titik, tanpa ikon.**

| Status | Latar | Teks |
| --- | --- | --- |
| Menunggu, Draf (payroll), H-10 | `warning/0.14` | `warning-text` |
| Disetujui, Sangat Baik | `success/0.12` | `success-text` |
| Ditolak, Perlu Perbaikan, H-≤5 | `danger/0.10` | `danger-text` |
| Terlambat, Baik | `accent/0.16` | `#8A3A06` |
| Draf (netral), Belum dinilai | `rgb(34 18 8 / 0.06)` | `text-secondary` |
| Final | `info/0.10` | `info-text` |

---

## Stat Tile, Grafik, Alert

- **Stat tile:** `surface-glass-strong`, min-h 136px, p-5; baris atas label 14px `text-secondary` + badge opsional; angka `text-num`; catatan 13px `text-tertiary`
- **Grafik batang bertumpuk (kehadiran):** warna `chart-*` di `ui-tokens.md`; batang non-aktif opacity 0.55, aktif 1 (hover); panel detail hari terpilih di atas grafik (`rgb(34 18 8 / 0.04)` `rounded-field`); legenda kotak 10px `rounded-[3px]` + label & total
- **Progress bar:** tinggi 8–10px pill, track `chart-track`, isi warna status/accent
- **Alert peringatan (mis. UMK):** latar `rgb(255 247 237 / 0.88)` + blur 20, border `warning/0.35`, `rounded-[18px]`, ikon segitiga `#B45309` 20px, judul D 700 14.5px + penjelasan 13.5px, tombol secondary di kanan
- **Tanggal di daftar pengingat:** kolom 44px — hari J 800 20px + bulan 12px `text-tertiary`

---

## Empty States

- Di dalam card yang sama: ikon status 28px (mis. circle-check `success`), judul J 700 16px, teks 14px `text-secondary` max 360px, rata tengah
- Tombol CTA jika ada aksi lanjutan yang logis

---

## Loading States

- Skeleton di dalam permukaan yang sama (kaca/solid): bar `rgb(34 18 8 / 0.07–0.11)` pill/`rounded-[10px]`, animasi pulse opacity 1 → 0.5 (1.4s, stagger 0.15s)
- Spinner hanya untuk aksi tombol
- Jangan tampilkan layar putih kosong saat fetching

---

## Performa Kaca (wajib, terutama portal)

- Portal karyawan: **maksimal 3 lapisan blur** — header, kartu utama (absen), bottom nav. Card lain `surface-solid`
- Sediakan mode solid: `@supports not (backdrop-filter: blur(1px))` → `surface-solid`. Pertimbangkan juga `prefers-reduced-transparency`
- Jangan menumpuk kaca di atas kaca lebih dari 2 lapis (mis. dropdown di atas header boleh; card kaca di dalam card kaca tidak)

---

## Catatan Tailwind v4

Project ini memakai **Tailwind v4**. Token didefinisikan dengan `@theme` di `globals.css` — tidak ada `tailwind.config.ts` untuk token. Tailwind v4 otomatis membuat utility class dari variabel `@theme`:

- `--color-accent` → `bg-accent`, `text-accent`, `border-accent`
- `--color-surface-glass` → `bg-surface-glass`, dst.
- Utilitas kaca (`glass`, `glass-strong`, `glass-overlay`, `surface-solid`) didefinisikan dengan `@utility` di `globals.css` — pakai itu, jangan menyalin rangkaian blur/border/shadow di setiap component
- Tautan bergaya tombol: `buttonClassName({ variant, size, fullWidth })` dari `components/common/Button.tsx` — jangan menyalin string kelas tombol
- Latar bentuk: `<BackdropShapes variant="app|portal|auth" />` (sudah dipasang di AppShell, PortalShell, AuthShell)

---

## Gaya yang Ditolak User (Anti "AI Slop")

User secara eksplisit **tidak suka** pola dekoratif yang terasa generik/buatan AI. Jangan buat:

- **Badge/pill dengan titik (dot) di depan teks** — contoh yang ditolak: pill "• Asisten HRD untuk UMKM" di atas judul hero. Tagline cukup teks biasa, atau tidak ada sama sekali
- **Deretan ikon dalam kotak/lingkaran** sebagai hiasan daftar fitur (ikon di chip `size-10 rounded-xl` di samping setiap poin). Daftar keunggulan/fitur ditulis sebagai teks
- **Titik/dot dekoratif, ikon berlebihan, eyebrow label warna-warni** yang tidak membawa informasi
- **Gradient (termasuk mesh gradient) dan efek pendar/glow** dekoratif. **Blur hanya boleh sebagai efek permukaan kaca** (disetujui user bersama tema glassmorphism, 2026-09-30) — tidak pada bentuk latar, teks, atau ikon

Ikon **boleh** hanya jika fungsional: aksi (tampilkan password, panah kembali, tambah), status (spinner, alert, check), atau navigasi. Satu ikon per konteks, bukan satu ikon per baris hiasan.

Pertanyaan pengecekan sebelum menambah elemen dekoratif: "apakah elemen ini membawa informasi atau aksi?" Jika tidak — jangan ditambahkan.

---

## Larangan (Do Nots)

- Jangan pakai kelas warna bawaan Tailwind (`bg-purple-500`, `text-gray-600`) — hanya token project
- Jangan definisikan warna di `tailwind.config.ts` — pakai `@theme` di globals.css
- Jangan tambah gradient pada background, card, maupun panel (user menolak gradient)
- Jangan pakai badge ber-dot, chip ikon dekoratif, atau ikon hiasan per baris (lihat "Gaya yang Ditolak User")
- Jangan taruh angka uang/data penting di permukaan kaca 60% (`surface-glass`) — pakai `glass-strong` atau solid
- Jangan pakai teks putih di atas `accent` — teks tombol primer `text-primary`
- Jangan pakai lebih dari satu font weight dalam satu elemen UI
- Jangan tampilkan raw error message ke user
- Jangan tumpuk lebih dari 2 level border-radius bersarang
- Jangan pakai `position: fixed` kecuali untuk pola yang memang membutuhkannya (bottom nav portal, drawer, header sticky sesuai desain)
