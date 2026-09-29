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

## globals.css — Definisi Token Lengkap

```css
@import "tailwindcss";

/* Token dari context/ui-tokens.md — jangan tambah warna di luar daftar ini.
   Tema hangat (oranye + krem) mengacu solvexaerp.tech atas permintaan user. */
@theme {
  /* Font (--font-dm-sans & --font-jakarta diisi next/font di layout.tsx) */
  --font-sans: var(--font-dm-sans), "DM Sans", sans-serif;
  --font-display: var(--font-jakarta), "Plus Jakarta Sans", sans-serif;

  /* Background halaman dan surface */
  --color-background: #fbf8f3;
  --color-surface: #ffffff;
  --color-surface-secondary: #fbf8f3;

  /* Border */
  --color-border: #f3e5d9;
  --color-border-strong: #ecd6c6;

  /* Teks */
  --color-text-primary: #221208;
  --color-text-secondary: #5b4636;
  --color-text-muted: #8a7561;

  /* Brand / accent */
  --color-accent: #f2790f;
  --color-accent-hover: #d9600a;
  /* Teks/tautan beraksen di atas latar terang (kontras cukup untuk teks kecil) */
  --color-accent-strong: #b34c08;
  --color-accent-soft: #fff3e9;
  /* Teks/ikon di atas permukaan accent (tombol primary) */
  --color-on-accent: #ffffff;

  /* Permukaan gelap (panel brand) */
  --color-inverse: #221208;
  --color-on-inverse: #fdf3ea;

  /* Status */
  --color-success: #15803d;
  --color-success-soft: #f0fdf4;
  --color-warning: #d97706;
  --color-warning-soft: #fffbeb;
  --color-danger: #dc2626;
  --color-danger-soft: #fef2f2;
  --color-info: #2563eb;
  --color-info-soft: #eff6ff;

  /* Radius */
  --radius-card: 22px;
  --radius-field: 14px;

  /* Bayangan hangat */
  --shadow-card: 0 2px 14px 0 rgb(120 60 10 / 0.06);
  --shadow-accent: 0 8px 20px 0 rgb(242 121 15 / 0.3);
}
```

---

## Batasan Pemakaian Token (preferensi user)

- `bg-accent/10` + `border-accent/30` **tidak** dipakai untuk badge/pill ber-dot dekoratif — pola ini ditolak user sebagai "AI slop"
- `bg-accent-soft` untuk kotak ikon hanya jika ikonnya fungsional (status/aksi), bukan hiasan per baris daftar fitur
- Tidak ada token untuk gradient/glow — sengaja. Detail: `ui-rules.md` bagian "Gaya yang Ditolak User"

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
- **Catatan aksesibilitas:** teks putih di atas `--color-accent` hanya ±2.8:1 (di bawah WCAG AA 4.5:1) — dipertahankan sesuai referensi untuk tombol (teks tebal). Jangan pakai `text-accent` untuk teks kecil di latar terang; pakai `text-accent-strong`
