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
- **Dipakai di:** /login, /forgot-password, /signup
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** input `rounded-field border border-border bg-surface-secondary px-4 py-3 text-sm focus:bg-surface focus:ring-1 focus:ring-accent focus:border-accent`; error `border-danger` + pesan `text-xs text-danger`; hint `text-xs text-text-muted`; label `text-sm font-semibold`
- **Catatan:** props wajib `id` + `label`; opsional `error`, `hint`, `labelAction` (elemen kanan label), `trailing` (elemen di dalam input kanan). Server-safe (tanpa state)

### PasswordField
- **Path:** apps/web/components/common/PasswordField.tsx
- **Dipakai di:** /login, /reset-password, /signup
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
- **Dipakai di:** /login, /forgot-password, /reset-password, /signup, /verify-email (nanti /invite/[token])
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
- **Dipakai di:** AuthShell, AppShell
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens, tema mengacu solvexaerp.tech (feature 04, tercatat di progress-tracker)
- **Pola kelas kunci:** ikon `size-9 rounded-xl bg-accent text-on-accent shadow-accent` + wordmark `font-display text-xl font-extrabold`
- **Catatan:** prop `tone` default|inverse (latar gelap). Placeholder sampai ada logo resmi (nama produk masih sementara). Dipakai juga di sidebar & drawer AppShell

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

### SignupForm
- **Path:** apps/web/components/auth/SignupForm.tsx
- **Dipakai di:** /signup
- **Referensi desain:** tanpa file desain — gaya auth feature 04 (ui-rules + ui-tokens, tema solvexaerp.tech), tercatat di progress-tracker feature 05
- **Pola kelas kunci:** sama dengan LoginForm (form `flex flex-col gap-4`, submit `mt-2 fullWidth`); state sukses = ikon `size-11 rounded-field bg-accent-soft text-accent` + AuthHeading + ResendVerificationButton + tautan teks `text-accent-strong`
- **Catatan:** field nama lengkap, nama usaha, email, password (tanpa konfirmasi — ada toggle lihat password). Validasi `signupSchema` dari `@exapay/shared`. Tombol "Salah email?" kembali ke form (password dikosongkan)

### VerifyEmailStatus
- **Path:** apps/web/components/auth/VerifyEmailStatus.tsx
- **Dipakai di:** /verify-email
- **Referensi desain:** tanpa file desain — gaya auth feature 04, tercatat di progress-tracker feature 05
- **Pola kelas kunci:** state memverifikasi = AuthHeading + skeleton `h-11 rounded-full bg-surface-secondary animate-pulse`; sukses/tidak valid = pola ikon tone ResetPasswordForm + `<Link>` berkelas tombol primary
- **Catatan:** client component, memanggil Server Action `verifyEmail` sekali saat mount (ref guard StrictMode). State: verifying | success | invalid-token | error (tombol "Coba lagi")

### ResendVerificationButton
- **Path:** apps/web/components/auth/ResendVerificationButton.tsx
- **Dipakai di:** SignupForm (/signup), LoginForm (/login, saat email belum terverifikasi)
- **Referensi desain:** tanpa file desain — gaya auth feature 04, tercatat di progress-tracker feature 05
- **Pola kelas kunci:** Button secondary fullWidth + FormAlert success/danger di atasnya (`flex flex-col gap-3`)
- **Catatan:** props `email`, `startWithCooldown`. Hitung mundur 60 detik (sama dengan cooldown API). Pola cooldown bisa dipakai ulang untuk kirim ulang undangan (feature 08)

### AppShell
- **Path:** apps/web/components/layout/AppShell.tsx
- **Dipakai di:** app/(main)/layout.tsx — semua halaman owner/admin/atasan
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** `lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]`; sidebar `sticky top-0 h-dvh border-r border-border bg-surface` (logo `h-16 px-6`); header `sticky top-0 z-20 h-16 border-b border-border bg-background px-4 sm:px-6 lg:px-8`; konten `mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8`; drawer mobile `fixed inset-0 z-40` + overlay `bg-inverse/40` + panel `w-72 max-w-[85vw] bg-surface shadow-card`
- **Catatan:** client component (state drawer). Props `user`, `activeTenant`, `tenants`, `sections` (hasil `staffMenuFor(role)` di server). Drawer: kunci scroll body, tutup via X / overlay / Escape / klik menu

### SidebarNav
- **Path:** apps/web/components/layout/SidebarNav.tsx
- **Dipakai di:** AppShell (sidebar desktop & drawer)
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** item `flex items-center gap-3 rounded-field px-3 py-2.5 text-sm` + ikon `size-5`; aktif `bg-accent-soft font-semibold text-accent-strong`; grup aktif `font-semibold text-text-primary` (tanpa latar); normal `font-medium text-text-secondary hover:bg-surface-secondary`; sub-menu `ml-5 border-l border-border pl-3`, item `rounded-field px-3 py-2` tanpa ikon
- **Catatan:** ikon hanya di menu level atas (fungsional/navigasi). Aktif = tautan paling spesifik (`findStaffLink`). Prop `onNavigate` untuk menutup drawer

### PortalShell / PortalBottomNav
- **Path:** apps/web/components/layout/PortalShell.tsx, PortalBottomNav.tsx
- **Dipakai di:** app/(portal)/layout.tsx — semua halaman /me
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** header `sticky top-0 z-20 h-14 border-b border-border bg-surface`, isi `max-w-lg`; konten `max-w-lg px-4 py-6`, wrapper `pb-[calc(4.5rem+env(safe-area-inset-bottom))]`; bottom nav `fixed inset-x-0 bottom-0 z-20 border-t bg-surface pb-[env(safe-area-inset-bottom)]` grid 5 kolom, item `flex-col items-center gap-1 py-2.5 text-xs`, aktif `font-semibold text-accent-strong`, normal `text-text-muted`
- **Catatan:** menu dari `PORTAL_MENU` (lib/navigation.ts). Beranda aktif hanya tepat di `/me`

### TenantSwitcher
- **Path:** apps/web/components/layout/TenantSwitcher.tsx
- **Dipakai di:** header AppShell & PortalShell
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** label nama usaha `text-sm font-semibold truncate` + peran `text-xs text-text-muted`; trigger `max-w-64 rounded-field px-3 py-2 hover:bg-surface-secondary` + ChevronDown; item `rounded-field px-3 py-2.5 hover:bg-surface-secondary`, usaha aktif ikon Check `text-accent-strong`
- **Catatan:** 1 usaha → teks statis (bukan tombol). Pindah usaha via Server Action `selectTenant` → `router.replace(redirectTo)` + `refresh` (halaman awal bisa berubah sesuai peran). Error tampil di panel. Pola berbeda dari `TenantPicker` (kartu besar di /login)

### UserMenu
- **Path:** apps/web/components/layout/UserMenu.tsx
- **Dipakai di:** header AppShell & PortalShell
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** trigger avatar `size-9 rounded-full bg-accent-soft text-sm font-semibold text-accent-strong`; panel nama `text-sm font-semibold` + email `text-xs text-text-muted`, pemisah `border-t border-border`, tombol Keluar `rounded-field px-3 py-2.5 text-sm font-medium` + ikon LogOut
- **Catatan:** inisial dari kata pertama + terakhir nama. Keluar = `<form action={logout}>` (spinner saat submit)

### DropdownMenu
- **Path:** apps/web/components/common/DropdownMenu.tsx
- **Dipakai di:** TenantSwitcher, UserMenu
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** panel `absolute top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-field border border-border bg-surface p-2 shadow-card`
- **Catatan:** props `label` (aria), `trigger`, `triggerClassName`, `align` start|end, `children(close)`. Tertutup saat klik di luar / Escape (fokus kembali ke trigger). Pakai ini untuk dropdown berikutnya — jangan buat varian baru

### PageHeader
- **Path:** apps/web/components/layout/PageHeader.tsx
- **Dipakai di:** /dashboard, /me, halaman "Segera hadir" — semua halaman di dalam shell
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** judul `font-display text-2xl font-extrabold tracking-tight`; deskripsi `text-sm text-text-secondary`; wrapper `flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between`
- **Catatan:** props `title`, `description`, `actions` (tombol kanan). Halaman shell memakai wrapper `flex flex-col gap-6` di bawah PageHeader

### EmptyState
- **Path:** apps/web/components/common/EmptyState.tsx
- **Dipakai di:** /dashboard, /me, halaman "Segera hadir"
- **Referensi desain:** tanpa file desain — ui-rules + ui-tokens (tema solvexaerp.tech), tercatat di progress-tracker feature 06
- **Pola kelas kunci:** card `rounded-card border border-border bg-surface px-6 py-12 text-center shadow-card`; ikon `size-11 rounded-field bg-accent-soft text-accent`; judul `font-display text-base font-bold`; teks `text-sm text-text-muted`
- **Catatan:** props `icon` (LucideIcon, opsional), `title`, `description`, `action`. Tautan CTA: salin kelas Button primary/secondary ke `<Link>` (lihat dashboard & catch-all)

### SessionPlaceholder (SEMENTARA)
- **Path:** apps/web/components/auth/SessionPlaceholder.tsx
- **Dipakai di:** /admin/tenants (dilepas dari /dashboard & /me di feature 06)
- **Referensi desain:** tanpa — halaman sementara untuk verifikasi redirect per peran (feature 04)
- **Pola kelas kunci:** card auth (`rounded-card border border-border bg-surface shadow-card`) + `dl grid grid-cols-[auto_1fr]`
- **Catatan:** server component; logout via `<form action={logout}>`. **Hapus** saat halaman aslinya dibangun (06 dashboard, 07 admin, 14/37 portal)
