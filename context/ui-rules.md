# UI Rules

Aturan ringkas untuk membangun UI project ini. File desain di `context/designs/` adalah source of truth untuk keputusan visual — aturan di sini menutup pola dan batasan terpenting agar UI konsisten tanpa harus menspesifikasikan setiap detail.

> **TEMPLATE:** Bagian bertanda `[SESUAIKAN]` wajib diisi ulang per project berdasarkan desain aktual. Nilai contoh di bawah adalah default yang aman, bukan keharusan.

---

## Font

`[SESUAIKAN]` — Import via `next/font/google` di root layout.

```typescript
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
```

Variabel `--font-sans` dideklarasikan di `@theme` pada `globals.css`. Terapkan class variabel font di tag `<html>` pada root layout. Jangan pakai system font sebagai font utama kecuali desain memintanya.

---

## Layout

`[SESUAIKAN]` contoh default:

- Max-width halaman: 1280px, centered
- Padding area konten utama: 32px desktop, 16px mobile
- Gap antar section: 24px
- Pola navigasi (navbar atas / sidebar): tentukan sesuai desain, lalu konsisten di semua halaman

---

## Cards

`[SESUAIKAN]` — setiap section konten hidup di dalam card:

```
background: var(--color-surface)
border: 1px solid var(--color-border)
border-radius: 16px
padding: 24px
```

Warna masuk ke dalam card lewat badge, bar, dan teks — bukan pada permukaan card.

---

## Hierarki Typography

Tiga level dipakai konsisten:

| Level | Ukuran | Weight | Token warna |
| --- | --- | --- | --- |
| Section heading | `[SESUAIKAN]` 16px | 600 | `--color-text-primary` |
| Body / konten utama | 14px | 500 | `--color-text-primary` |
| Secondary / muted | 12px | 400 | `--color-text-muted` |

---

## Buttons

`[SESUAIKAN]`:

- **Primary:** background `--color-accent`, teks putih, radius 8px, padding 8px 16px
- **Secondary:** background surface, border `--color-border`, teks `--color-text-primary`

---

## Form Inputs

`[SESUAIKAN]`:

```
background: var(--color-surface)
border: 1px solid var(--color-border)
border-radius: 8px
padding: 8px 12px
font-size: 14px
focus: ring-1 ring-accent border-accent
```

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

## Larangan (Do Nots)

- Jangan pakai kelas warna bawaan Tailwind (`bg-purple-500`, `text-gray-600`) — hanya token project
- Jangan definisikan warna di `tailwind.config.ts` — pakai `@theme` di globals.css
- Jangan tambah gradient pada background card (kecuali desain memintanya)
- Jangan pakai lebih dari satu font weight dalam satu elemen UI
- Jangan tampilkan raw error message ke user
- Jangan tumpuk lebih dari 2 level border-radius bersarang
- Jangan pakai `position: fixed` kecuali untuk pola yang memang membutuhkannya (navbar sticky sesuai desain)
