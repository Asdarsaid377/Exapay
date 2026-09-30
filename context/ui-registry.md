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

> Semua component di bawah memakai **Tema Glassmorphism** (redesign 2026-09-30). Token & utilitas: `ui-tokens.md`; pola: `ui-rules.md`.

### Button
- **Path:** apps/web/components/common/Button.tsx
- **Dipakai di:** semua halaman
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Button)
- **Pola kelas kunci:** pill `rounded-full font-display text-sm font-bold`, `active:scale-[0.97]`, focus `ring-3 ring-accent/45`; size `md` `h-10 px-5` · `lg` `h-12 px-6`; primary `bg-accent text-on-accent hover:bg-accent-hover` (teks cokelat tua); secondary `border border-border-control bg-control hover:border-border-control-hover hover:bg-surface-solid`; dark `bg-inverse text-on-inverse hover:bg-inverse-hover`; disabled `bg-fill text-text-muted`
- **Catatan:** props `variant` (primary|secondary|dark), `size` (md|lg), `loading` (spinner, warna varian tetap), `fullWidth`. Default `type="button"`. **`buttonClassName(opts)`** untuk `<Link>` bergaya tombol — jangan salin string kelas. Form auth & aksi mobile pakai `size="lg"`

### TextField
- **Path:** apps/web/components/common/TextField.tsx
- **Dipakai di:** /login, /forgot-password, /signup
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Input)
- **Pola kelas kunci:** input `h-11 rounded-field border border-border-control bg-control px-3.5 text-body`, focus `bg-surface-solid border-accent ring-3 ring-accent/28`; error `border-danger` + pesan `text-caption text-danger-text`; hint `text-caption text-text-tertiary`; disabled `bg-fill-subtle border-border-subtle text-text-tertiary`; label `text-[13px] font-bold`
- **Catatan:** props wajib `id` + `label`; opsional `error`, `hint`, `labelAction`, `trailing`. Server-safe (tanpa state)

### PasswordField
- **Path:** apps/web/components/common/PasswordField.tsx
- **Dipakai di:** /login, /reset-password, /signup
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Input)
- **Pola kelas kunci:** TextField + tombol ikon mata `size-8 rounded-inner text-text-secondary hover:bg-fill-subtle`
- **Catatan:** client component; toggle tampil/sembunyi password. Props sama dengan TextField kecuali `type`/`trailing`

### FormAlert
- **Path:** apps/web/components/common/FormAlert.tsx
- **Dipakai di:** form auth, ResendVerificationButton
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (badge tint / alert UMK)
- **Pola kelas kunci:** `rounded-field px-3.5 py-3 text-small`; danger `bg-danger-soft` + ikon `text-danger-text`; success `bg-success-soft` + `text-success`; info `bg-info-soft` + `text-info-text`; warning `border border-warning-border bg-warning-surface` + ikon segitiga `text-warning-icon`; teks `text-text-primary`
- **Catatan:** `tone` danger (role=alert) | success | info | warning (role=status). Untuk error level form & peringatan, bukan per field. Varian warning = pola banner UMK dashboard (feature 34)

### EmptyState
- **Path:** apps/web/components/common/EmptyState.tsx
- **Dipakai di:** /dashboard, /me, halaman "Segera hadir"
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (state empty — tindakan tertunda)
- **Pola kelas kunci:** card `glass-strong` (atau `surface-solid`) `rounded-card px-6 py-12 text-center`; ikon status `size-7` tanpa kotak (`text-accent-strong` / `text-success`); judul `font-display text-base font-bold`; teks `text-sm text-text-secondary`
- **Catatan:** props `icon`, `iconTone` (accent|success), `title`, `description`, `action`, `surface` (glass|solid — portal di luar kartu utama pakai solid). CTA pakai `buttonClassName`

### DropdownMenu
- **Path:** apps/web/components/common/DropdownMenu.tsx
- **Dipakai di:** TenantSwitcher, UserMenu
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Dropdown)
- **Pola kelas kunci:** panel `glass-overlay absolute top-full z-30 mt-2 rounded-[18px] p-2 flex flex-col gap-0.5`; item di dalam: `rounded-inner` hover `bg-accent/10`, terpilih `bg-accent/10` + Check `text-accent-strong`; pemisah `mx-2 border-t border-border-subtle`
- **Catatan:** props `label` (aria), `trigger`, `triggerClassName`, `align` start|end, `panelClassName` (lebar, default `w-80`), `children(close)`. Tertutup saat klik di luar / Escape. Pakai ini untuk dropdown berikutnya

### BackdropShapes
- **Path:** apps/web/components/layout/BackdropShapes.tsx
- **Dipakai di:** AppShell, PortalShell, AuthShell, SessionPlaceholder
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html, context/designs/me.html + design-tokens.html
- **Pola kelas kunci:** `pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background`; bentuk `absolute rounded-full bg-shape-peach|sand|cream` + rounded-rect `rounded-[44px]/[56px] bg-shape-apricot`
- **Catatan:** `variant` app|portal|auth. Latar flat di belakang kaca — tanpa gradient/blur. `fixed` agar kaca selalu punya latar saat scroll

### AppShell
- **Path:** apps/web/components/layout/AppShell.tsx
- **Dipakai di:** app/(main)/layout.tsx — semua halaman owner/admin/atasan
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Desktop 1440, Mobile 390, drawer)
- **Pola kelas kunci:** wrapper `px-3.5 pt-3 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-5 lg:p-5`; sidebar `glass sticky top-5 h-[calc(100dvh-2.5rem)] rounded-card px-3.5 py-5`; header `glass sticky top-3 h-15 rounded-[20px] lg:top-5 lg:h-17 lg:rounded-card` (tenant switcher · tanggal · UserMenu); drawer `glass-overlay w-75 rounded-[26px]` + overlay `bg-inverse/32` + kartu user `border-t border-border-subtle`; konten `flex flex-col gap-4 lg:gap-5`
- **Catatan:** client (state drawer). Props `user`, `activeTenant`, `tenants`, `sections` (`staffMenuFor(role)`), `todayLabel` (dari server, `formatLongDate`). Drawer: kunci scroll, tutup via X / overlay / Escape / klik menu

### SidebarNav
- **Path:** apps/web/components/layout/SidebarNav.tsx
- **Dipakai di:** AppShell (sidebar & drawer)
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Item sidebar)
- **Pola kelas kunci:** item `h-11 rounded-field px-3 gap-3 text-[14.5px]` (drawer `touch`: `h-11.5 text-[15px]`) + ikon `size-4.75`; aktif `bg-accent-soft font-bold text-accent-strong`; hover `bg-glass-hover`; grup = tombol + chevron berputar, label grup `text-accent-strong` jika berisi halaman aktif; sub `h-9.5 pl-10.75 rounded-inner text-sm font-medium`, aktif `bg-accent/12 text-accent-strong`
- **Catatan:** grup dibuka/ditutup dengan klik (terbuka otomatis jika berisi halaman aktif). Aktif = tautan paling spesifik (`findStaffLink`). Prop `onNavigate` menutup drawer. Hitungan tertunda (pill `bg-inverse`) belum ada — tambah saat data tersedia (feature 15/20)

### TenantSwitcher
- **Path:** apps/web/components/layout/TenantSwitcher.tsx
- **Dipakai di:** header AppShell & PortalShell
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (header + dropdown "Pindah usaha")
- **Pola kelas kunci:** label nama `font-display text-[14.5px] lg:text-[15px] font-bold` + sub `text-caption lg:text-[13px] text-text-secondary`; trigger `h-11 lg:h-12.5 rounded-field hover:bg-glass-hover` + ChevronsUpDown; item `min-h-13 rounded-inner px-3` (nama `text-sm font-bold` + peran `text-[13px]`)
- **Catatan:** 1 usaha → teks statis. Prop `subtitle` (default label peran; portal: "Nama · Peran"). Pindah via `selectTenant` → `router.replace(redirectTo)` + `refresh`. Kota di sub-judul ("Pemilik · Makassar") & "Daftarkan usaha baru" di desain belum ada fiturnya

### UserMenu / UserAvatar
- **Path:** apps/web/components/layout/UserMenu.tsx, UserAvatar.tsx
- **Dipakai di:** header AppShell & PortalShell; avatar juga di kartu user drawer
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (avatar + dropdown akun)
- **Pola kelas kunci:** avatar `size-10` (lg: `size-11`) `rounded-full bg-inverse text-on-inverse font-display font-bold`; trigger `rounded-full p-0.75 hover:bg-glass-hover lg:h-12.5` + ChevronDown (desktop); panel `w-65`: nama `font-display text-[15px] font-bold` + email `text-[13px]`, Keluar `h-11 rounded-inner text-danger-text font-bold hover:bg-danger/8`
- **Catatan:** UserMenu prop `showChevron` (portal: false). Keluar = `<form action={logout}>`. UserAvatar prop `size` md|lg

### PortalShell / PortalBottomNav
- **Path:** apps/web/components/layout/PortalShell.tsx, PortalBottomNav.tsx
- **Dipakai di:** app/(portal)/layout.tsx — semua halaman /me
- **Referensi desain:** context/designs/me.html + design-tokens.html
- **Pola kelas kunci:** wrapper `mx-auto max-w-lg px-3.5 pt-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] gap-3.5`; header `glass sticky top-3 h-15 rounded-[20px]`; bottom nav mengambang `fixed inset-x-0 bottom-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]` → `glass h-18 rounded-[24px] p-1.5 grid-cols-5 gap-1`, item `rounded-[18px] text-xs`, aktif `bg-accent-soft font-bold text-accent-strong`, default `text-text-secondary`
- **Catatan:** maks 3 lapisan blur di portal (header, kartu utama, bottom nav) — card lain `surface-solid`. Beranda aktif hanya tepat di `/me`

### PageHeader
- **Path:** apps/web/components/layout/PageHeader.tsx
- **Dipakai di:** /dashboard, /me, halaman "Segera hadir"
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (sapaan "Selamat pagi, Budi")
- **Pola kelas kunci:** `px-1.5 pt-1`; judul `font-display text-2xl lg:text-h1 font-extrabold tracking-[-0.025em]`; deskripsi `text-sm lg:text-body text-text-secondary`
- **Catatan:** props `title`, `description`, `actions`. Sapaan: `greetingFor()` + `firstNameOf()` dari `lib/datetime.ts`

### AuthShell
- **Path:** apps/web/components/auth/AuthShell.tsx
- **Dipakai di:** /login, /forgot-password, /reset-password, /signup, /verify-email (nanti /invite/[token])
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tidak ada snapshot halaman auth) — redesign 2026-09-30
- **Pola kelas kunci:** grid `lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-5 lg:p-5`; panel foto mengambang `rounded-sheet overflow-hidden bg-inverse p-12` + `<Image fill object-cover>` + lapisan `bg-inverse/60` (≥lg); highlight teks `grid-cols-2`, item `border-t border-on-inverse/20 pt-3`; card form `glass-strong rounded-card p-6 sm:p-8 gap-6` di atas `BackdropShapes variant="auth"`
- **Catatan:** foto `public/images/auth-team.jpg` (Unsplash lLrZy195sIU, ThisisEngineering — kredit di pojok panel). `title`/`description` opsional. `footer` untuk tautan di bawah card. Mobile: logo di atas card

### AuthHeading
- **Path:** apps/web/components/auth/AuthHeading.tsx
- **Dipakai di:** AuthShell, form auth
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tidak ada snapshot halaman auth) — redesign 2026-09-30
- **Pola kelas kunci:** judul `font-display text-2xl leading-tight font-extrabold tracking-[-0.025em]`; deskripsi `text-body text-text-secondary`

### ExapayLogo
- **Path:** apps/web/components/auth/ExapayLogo.tsx
- **Dipakai di:** AuthShell, AppShell (sidebar & drawer)
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (logo sidebar)
- **Pola kelas kunci:** kotak `size-8 rounded-[10px] bg-accent` + huruf "e" `font-display text-lg font-extrabold text-on-accent`; wordmark "exapay" `font-display text-[21px] font-extrabold tracking-[-0.03em]`
- **Catatan:** prop `tone` default|inverse. Placeholder dari desain sampai ada logo resmi

### BackToLoginLink
- **Path:** apps/web/components/auth/BackToLoginLink.tsx
- **Dipakai di:** /forgot-password, /reset-password, /verify-email
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tidak ada snapshot halaman auth) — redesign 2026-09-30
- **Pola kelas kunci:** `font-medium text-accent-strong hover:underline underline-offset-4` + ikon panah
- **Catatan:** dipasang sebagai `footer` AuthShell

### TenantPicker
- **Path:** apps/web/components/auth/TenantPicker.tsx
- **Dipakai di:** /login (langkah pilih usaha)
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tidak ada snapshot halaman auth) — redesign 2026-09-30 — pola item dropdown tenant
- **Pola kelas kunci:** item `min-h-15 rounded-field border border-border-control bg-control px-4 hover:border-accent hover:bg-accent/10`; nama `text-[15px] font-bold` + peran `text-[13px] text-text-secondary`; ChevronRight / spinner
- **Catatan:** props `tenants`, `pendingTenantId`, `onSelect`. Ikon kotak per baris dihapus (aturan anti "AI slop")

### LoginForm / ForgotPasswordForm / ResetPasswordForm / SignupForm / VerifyEmailStatus
- **Path:** apps/web/components/auth/LoginForm.tsx, ForgotPasswordForm.tsx, ResetPasswordForm.tsx, SignupForm.tsx, VerifyEmailStatus.tsx
- **Dipakai di:** /login, /forgot-password, /reset-password, /signup, /verify-email
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tidak ada snapshot halaman auth) — redesign 2026-09-30
- **Pola kelas kunci:** form `flex flex-col gap-4`, submit `size="lg" fullWidth mt-2`; state hasil = ikon status `size-11 rounded-field bg-<tone>-soft text-<tone-kontras>` (accent-strong / success / warning-icon) + AuthHeading; tautan bergaya tombol `buttonClassName({ size: "lg", fullWidth: true })`; skeleton verifikasi `h-12 rounded-full bg-fill animate-exa-pulse`
- **Catatan:** validasi zod dari `@exapay/shared`; setiap form punya state loading/error/sukses; memanggil Server Action `actions/auth.ts`. LoginForm props `initialTenants`, `next`; state "unverified" menampilkan ResendVerificationButton. VerifyEmailStatus memverifikasi otomatis saat mount (ref guard). SignupForm: tombol teks "Salah email?" kembali ke form

### ResendVerificationButton
- **Path:** apps/web/components/auth/ResendVerificationButton.tsx
- **Dipakai di:** SignupForm (/signup), LoginForm (/login, email belum terverifikasi)
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tidak ada snapshot halaman auth) — redesign 2026-09-30
- **Pola kelas kunci:** Button secondary `size="lg" fullWidth` + FormAlert success/danger di atasnya (`flex flex-col gap-3`)
- **Catatan:** props `email`, `startWithCooldown`. Hitung mundur 60 detik (sama dengan cooldown API). Pola cooldown bisa dipakai ulang untuk kirim ulang undangan (feature 08)

### SessionPlaceholder (SEMENTARA)
- **Path:** apps/web/components/auth/SessionPlaceholder.tsx
- **Dipakai di:** /admin/tenants
- **Referensi desain:** tanpa — halaman sementara (feature 04)
- **Pola kelas kunci:** `BackdropShapes variant="auth"` + card `glass-strong rounded-card` + `dl grid grid-cols-[auto_1fr]` (label `text-text-tertiary`)
- **Catatan:** server component; logout via `<form action={logout}>`. **Hapus** saat panel super-admin dibangun (feature 07)
