# UI Registry

Dokumen hidup. Di-update setiap kali sebuah component selesai dibuat. **Baca file ini sebelum membangun component baru** — cocokkan dengan pola yang sudah ada sebelum menciptakan pola baru.

---

## Cara Pakai

Sebelum membangun component apapun:

1. Cek apakah component serupa sudah ada di daftar bawah
2. Jika ada — pakai component yang sama atau extend props-nya. Cocokkan kelasnya persis
3. Jika belum ada — build mengikuti `ui-workflow.md`, `ui-rules.md`, dan `ui-tokens.md`, lalu tambahkan ke sini

Setelah membangun component apapun — update file ini dengan format entry di bawah.

---

## Format Entry

```markdown
### NamaComponent
- **Path:** apps/web/components/<folder>/NamaComponent.tsx
- **Dipakai di:** /route yang memakai
- **Referensi desain:** context/designs/<file>.png (atau "tanpa referensi — keputusan tercatat di progress-tracker")
- **Pola kelas kunci:** bg-surface border border-border rounded-2xl p-6
- **Catatan:** varian, props penting, batasan
```

---

## Components

### Button
- **Path:** apps/web/components/common/Button.tsx
- **Dipakai di:** /login, /forgot-password, /reset-password
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** `rounded-full px-6 py-2.5 text-sm font-semibold`; primary `bg-accent text-on-accent shadow-accent hover:bg-accent-hover`; secondary `bg-surface border-2 border-border-strong hover:bg-surface-secondary`
- **Catatan:** props `variant` (primary|secondary), `loading` (spinner + disabled), `fullWidth`. Default `type="button"`. Untuk tautan bergaya tombol, salin kelas primary ke `<Link>` (lihat `ResetPasswordForm`)

### TextField
- **Path:** apps/web/components/common/TextField.tsx
- **Dipakai di:** /login, /forgot-password
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** input `rounded-field border border-border bg-surface-secondary px-4 py-3 text-sm focus:bg-surface focus:ring-1 focus:ring-accent focus:border-accent`; error `border-danger` + pesan `text-xs text-danger`; hint `text-xs text-text-muted`; label `text-sm font-semibold`
- **Catatan:** props wajib `id` + `label`; opsional `error`, `hint`, `labelAction` (elemen kanan label), `trailing` (elemen di dalam input kanan). Server-safe (tanpa state)

### PasswordField
- **Path:** apps/web/components/common/PasswordField.tsx
- **Dipakai di:** /login, /reset-password
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** TextField + tombol ikon mata `text-text-muted hover:text-text-secondary`
- **Catatan:** client component; toggle tampil/sembunyi password. Props sama dengan TextField kecuali `type`/`trailing`

### FormAlert
- **Path:** apps/web/components/common/FormAlert.tsx
- **Dipakai di:** /login, /forgot-password, /reset-password
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** `rounded-field px-4 py-3 text-sm`; `bg-danger-soft|bg-success-soft|bg-info-soft`, ikon berwarna tone, teks `text-text-primary`
- **Catatan:** `tone` danger (role=alert) | success | info (role=status). Untuk error level form, bukan per field

### AuthShell
- **Path:** apps/web/components/auth/AuthShell.tsx
- **Dipakai di:** /login, /forgot-password, /reset-password (nanti /signup, /verify-email, /invite/[token])
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** grid `lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]`; panel foto `relative overflow-hidden bg-inverse p-12` + `<Image fill className="object-cover">` + lapisan `absolute inset-0 bg-inverse/60` (hanya ≥lg); konten di bawah (`mt-auto`), highlight teks saja `grid grid-cols-2`, tiap item `border-t border-on-inverse/20 pt-3` (tanpa ikon/badge); teks `text-on-inverse`; card `max-w-md rounded-card border border-border bg-surface shadow-card p-6 sm:p-8 gap-6`
- **Catatan:** foto `public/images/auth-team.jpg` (Unsplash lLrZy195sIU, ThisisEngineering, lisensi Unsplash — kredit di pojok panel). `title`/`description` opsional — kosongkan jika form merender `AuthHeading` sendiri. `footer` untuk tautan di bawah card. Mobile: logo di atas card, panel brand disembunyikan

### AuthHeading
- **Path:** apps/web/components/auth/AuthHeading.tsx
- **Dipakai di:** AuthShell, LoginForm, ForgotPasswordForm, ResetPasswordForm
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** judul `font-display text-2xl font-extrabold tracking-tight text-text-primary`; deskripsi `text-sm text-text-secondary`
- **Catatan:** level "Judul halaman / card auth" di ui-rules

### ExapayLogo
- **Path:** apps/web/components/auth/ExapayLogo.tsx
- **Dipakai di:** AuthShell
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** ikon `size-9 rounded-xl bg-accent text-on-accent shadow-accent` + wordmark `font-display text-xl font-extrabold`
- **Catatan:** prop `tone` default|inverse (latar gelap). Placeholder sampai ada logo resmi (nama produk masih sementara). Kandidat dipakai ulang di sidebar (feature 06)

### BackToLoginLink
- **Path:** apps/web/components/auth/BackToLoginLink.tsx
- **Dipakai di:** /forgot-password, /reset-password
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** `font-medium text-accent-strong hover:underline underline-offset-4` + ikon panah
- **Catatan:** dipasang sebagai `footer` AuthShell

### TenantPicker
- **Path:** apps/web/components/auth/TenantPicker.tsx
- **Dipakai di:** /login (langkah pilih usaha)
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** item `rounded-field border border-border px-4 py-3 hover:border-accent hover:bg-accent-soft`; ikon `size-10 rounded-xl bg-accent-soft text-accent`
- **Catatan:** props `tenants`, `pendingTenantId` (spinner + kunci pilihan), `onSelect`. Label peran dari `lib/roleLabels.ts`. Pola list serupa bisa dipakai tenant switcher header (feature 06)

### LoginForm / ForgotPasswordForm / ResetPasswordForm
- **Path:** apps/web/components/auth/LoginForm.tsx, ForgotPasswordForm.tsx, ResetPasswordForm.tsx
- **Dipakai di:** /login, /forgot-password, /reset-password
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** form `flex flex-col gap-4`, tombol submit `mt-2 fullWidth`; state hasil = ikon `size-11 rounded-field bg-<tone>-soft text-<tone>` + AuthHeading dalam `flex flex-col gap-4`
- **Catatan:** validasi client memakai zod schema dari `@exapay/shared`. Setiap form punya state loading/error/sukses. Memanggil Server Action `actions/auth.ts`. LoginForm props: `initialTenants` (mulai di langkah pilih usaha), `next` (redirect setelah login, hanya path internal)

### SessionPlaceholder (SEMENTARA)
- **Path:** apps/web/components/auth/SessionPlaceholder.tsx
- **Dipakai di:** /dashboard, /me, /admin/tenants
- **Referensi desain:** tanpa — halaman sementara untuk verifikasi redirect per peran (feature 04)
- **Pola kelas kunci:** card auth (`rounded-card border border-border bg-surface shadow-card`) + `dl grid grid-cols-[auto_1fr]`
- **Catatan:** server component; logout via `<form action={logout}>`. **Hapus** saat halaman aslinya dibangun (06 dashboard, 07 admin, 14/37 portal)
