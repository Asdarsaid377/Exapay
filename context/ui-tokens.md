# UI Tokens

Design tokens project ini. Semua warna, typography, spacing, dan nilai component diekstrak dari desain di `context/designs/`. Pakai nilai persis dari sini — jangan hardcode warna atau memakai kelas warna bawaan Tailwind di component.

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
className="bg-[#F6F7FB] text-[#101828]"

// Jangan — kelas warna bawaan Tailwind
className="bg-purple-500 text-gray-600"
```

---

## globals.css — Definisi Token Lengkap

```css
@import "tailwindcss";

@theme {
  /* Font */
  --font-sans: "Inter", sans-serif;

  /* Background halaman dan surface */
  --color-background: #f6f7fb;
  --color-surface: #ffffff;
  --color-surface-secondary: #f9fafb;

  /* Border */
  --color-border: #e7eaf3;

  /* Teks */
  --color-text-primary: #101828;
  --color-text-secondary: #4a5565;
  --color-text-muted: #99a1af;

  /* Brand / accent */
  --color-accent: #7c5cfc;
  --color-accent-hover: #6a4be0;
  --color-accent-soft: #f1edff;

  /* Status */
  --color-success: #10b981;
  --color-success-soft: #ecfdf5;
  --color-warning: #ff8904;
  --color-warning-soft: #fff7ed;
  --color-danger: #ef4444;
  --color-danger-soft: #fef2f2;
  --color-info: #61a8ff;
  --color-info-soft: #eff6ff;
}
```

---

## Aturan Penambahan Token

1. Token baru hanya ditambahkan jika muncul di desain dan belum bisa diwakili token yang ada
2. Nama token mendeskripsikan **peran**, bukan warna — `--color-danger`, bukan `--color-red`
3. Setiap token baru dicatat di file ini beserta konteks pemakaiannya
4. Jangan pernah menambah warna langsung di component tanpa lewat token
