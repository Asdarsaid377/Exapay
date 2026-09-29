# UI Rules

Aturan ringkas untuk membangun UI project ini. File desain di `context/designs/` adalah source of truth untuk keputusan visual — aturan di sini menutup pola dan batasan terpenting agar UI konsisten tanpa harus menspesifikasikan setiap detail.

> **TEMPLATE:** Bagian bertanda `[SESUAIKAN]` wajib diisi ulang per project berdasarkan desain aktual. Nilai contoh di bawah adalah default yang aman, bukan keharusan.

---

## Font

Dua font via `next/font/google` di root layout (`apps/web/app/layout.tsx`):

- **DM Sans** → `--font-sans` (default `body`) — semua teks
- **Plus Jakarta Sans** → `--font-display` (kelas `font-display`) — judul halaman/card, wordmark, heading besar; weight 700–800, `tracking-tight`

Tema mengacu https://solvexaerp.tech/.

---

## Layout

`[SESUAIKAN]` contoh default:

- Max-width halaman: 1280px, centered
- Padding area konten utama: 32px desktop, 16px mobile
- Gap antar section: 24px
- Pola navigasi (navbar atas / sidebar): tentukan sesuai desain, lalu konsisten di semua halaman

---

## Cards

Setiap section konten hidup di dalam card:

```
bg-surface border border-border rounded-card (22px) shadow-card p-6 (sm:p-8 untuk card tunggal seperti auth)
```

Warna masuk ke dalam card lewat badge, bar, ikon, dan teks — bukan pada permukaan card. Panel brand/hero halaman auth memakai **foto** (`next/image` fill + `object-cover`) dengan lapisan gelap rata `bg-inverse/60` agar teks `text-on-inverse` terbaca. **Tanpa gradient dan tanpa efek pendar** (keputusan user). Foto disimpan lokal di `apps/web/public/images/`, sertakan kredit fotografer.

---

## Hierarki Typography

| Level | Ukuran | Weight | Token |
| --- | --- | --- | --- |
| Judul halaman / card auth | 24px (`text-2xl`) | 800, `font-display tracking-tight` | `text-text-primary` |
| Section heading | 16px | 700, `font-display` | `text-text-primary` |
| Label form | 14px | 600 | `text-text-primary` |
| Body / konten utama | 14px | 400–500 | `text-text-primary` / `text-text-secondary` |
| Secondary / muted | 12px | 400 | `text-text-muted` |

---

## Buttons

- Bentuk **pill**: `rounded-full px-6 py-2.5 text-sm font-semibold`
- **Primary:** `bg-accent text-on-accent shadow-accent hover:bg-accent-hover`
- **Secondary:** `bg-surface border-2 border-border-strong text-text-primary hover:bg-surface-secondary`
- Tautan teks: `text-accent-strong hover:underline underline-offset-4` (bukan `text-accent` — kontras kurang untuk teks kecil)
- Komponen: `components/common/Button.tsx`

---

## Form Inputs

```
rounded-field (14px) border border-border bg-surface-secondary px-4 py-3 text-sm
placeholder:text-text-muted
focus: bg-surface border-accent ring-1 ring-accent
error: border-danger ring-danger + pesan text-xs text-danger
```

Komponen: `components/common/TextField.tsx`, `PasswordField.tsx`.

---

## Empty States

Setiap section yang bisa kosong wajib punya empty state:

- Teks deskriptif singkat memakai `--color-text-muted`
- Icon opsional di atas teks
- Tombol CTA jika ada aksi lanjutan yang logis

---

## Loading States

- Skeleton untuk konten yang bentuknya bisa diprediksi (card, table row)
- Spinner hanya untuk aksi tombol
- Jangan tampilkan layar putih kosong saat fetching

---

## Catatan Tailwind v4

Project ini memakai **Tailwind v4**. Token didefinisikan dengan `@theme` di `globals.css` — tidak ada `tailwind.config.ts` untuk token. Tailwind v4 otomatis membuat utility class dari variabel `@theme`:

- `--color-accent` → `bg-accent`, `text-accent`, `border-accent`
- `--color-surface` → `bg-surface`, dst.

---

## Gaya yang Ditolak User (Anti "AI Slop")

User secara eksplisit **tidak suka** pola dekoratif yang terasa generik/buatan AI. Jangan buat:

- **Badge/pill dengan titik (dot) di depan teks** — contoh yang ditolak: pill "• Asisten HRD untuk UMKM" di atas judul hero. Tagline cukup teks biasa, atau tidak ada sama sekali
- **Deretan ikon dalam kotak/lingkaran** sebagai hiasan daftar fitur (ikon di chip `size-10 rounded-xl` di samping setiap poin). Daftar keunggulan/fitur ditulis sebagai teks
- **Titik/dot dekoratif, ikon berlebihan, eyebrow label warna-warni** yang tidak membawa informasi
- Gradient dan efek pendar (glow/blur) dekoratif

Ikon **boleh** hanya jika fungsional: aksi (tampilkan password, panah kembali), status (spinner, ikon alert/error), atau navigasi. Satu ikon per konteks, bukan satu ikon per baris hiasan.

Pertanyaan pengecekan sebelum menambah elemen dekoratif: "apakah elemen ini membawa informasi atau aksi?" Jika tidak — jangan ditambahkan.

---

## Larangan (Do Nots)

- Jangan pakai kelas warna bawaan Tailwind (`bg-purple-500`, `text-gray-600`) — hanya token project
- Jangan definisikan warna di `tailwind.config.ts` — pakai `@theme` di globals.css
- Jangan tambah gradient pada background card maupun panel (user menolak gradient)
- Jangan pakai badge ber-dot, chip ikon dekoratif, atau ikon hiasan per baris (lihat "Gaya yang Ditolak User")
- Jangan pakai lebih dari satu font weight dalam satu elemen UI
- Jangan tampilkan raw error message ke user
- Jangan tumpuk lebih dari 2 level border-radius bersarang
- Jangan pakai `position: fixed` kecuali untuk pola yang memang membutuhkannya (navbar sticky sesuai desain)
