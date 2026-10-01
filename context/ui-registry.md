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
- **Catatan:** props `variant` (primary|secondary|dark|danger — danger hanya di dialog konfirmasi berisiko), `size` (md|lg), `loading` (spinner, warna varian tetap), `fullWidth`. Default `type="button"`. **`buttonClassName(opts)`** untuk `<Link>` bergaya tombol — jangan salin string kelas. Form auth & aksi mobile pakai `size="lg"`

### TextField
- **Path:** apps/web/components/common/TextField.tsx
- **Dipakai di:** /login, /forgot-password, /signup
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Input)
- **Pola kelas kunci:** input `h-11 rounded-field border border-border-control bg-control px-3.5 text-body`, focus `bg-surface-solid border-accent ring-3 ring-accent/28`; error `border-danger` + pesan `text-caption text-danger-text`; hint `text-caption text-text-tertiary`; disabled `bg-fill-subtle border-border-subtle text-text-tertiary`; label `text-[13px] font-bold`
- **Catatan:** props wajib `id` + `label`; opsional `error`, `hint` (ReactNode), `requiredMark` (* merah), `labelAction`, `trailing`, `leading` (awalan teks di kiri input, `pl-10`, mis. "Rp" — feature 17), `labelClassName` (kelas baris label, mis. `lg:sr-only` di baris tabel yang punya judul kolom — label tetap terbaca screen reader). Server-safe (tanpa state)

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
- **Dipakai di:** /dashboard, /me (gagal muat kartu absen), /me/attendance (solid), halaman "Segera hadir", /organization (surface none)
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (state empty — tindakan tertunda)
- **Pola kelas kunci:** card `glass-strong` (atau `surface-solid`) `rounded-card px-6 py-12 text-center`; ikon status `size-7` tanpa kotak (`text-accent-strong` / `text-success`); judul `font-display text-base font-bold`; teks `text-sm text-text-secondary`
- **Catatan:** props `icon`, `iconTone` (accent|success), `title`, `description`, `action`, `surface` (glass|solid|none — portal di luar kartu utama pakai solid; `none` = di dalam card lain, `py-10` tanpa latar, judul h3). CTA pakai `buttonClassName` atau tombol client

### DropdownMenu
- **Path:** apps/web/components/common/DropdownMenu.tsx
- **Dipakai di:** TenantSwitcher, UserMenu, MemberActions, OrgItemActions
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
- **Dipakai di:** app/(main)/layout.tsx — semua halaman owner/admin/atasan; app/(admin)/layout.tsx — panel super-admin
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Desktop 1440, Mobile 390, drawer)
- **Pola kelas kunci:** wrapper `px-3.5 pt-3 lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-5 lg:p-5`; sidebar `glass sticky top-5 h-[calc(100dvh-2.5rem)] rounded-card px-3.5 py-5`; header `glass sticky top-3 h-15 rounded-[20px] lg:top-5 lg:h-17 lg:rounded-card` (tenant switcher · tanggal · UserMenu); drawer `glass-overlay w-75 rounded-[26px]` + overlay `bg-inverse/32` + kartu user `border-t border-border-subtle`; konten `flex flex-col gap-4 lg:gap-5`
- **Catatan:** client (state drawer). Props `user`, `headerStart` (sisi kiri header: `<TenantSwitcher>` di area usaha, judul "Panel Super-admin" di /admin — feature 07), `sections` (`staffMenuFor(role)` / `ADMIN_MENU`), `todayLabel` (dari server, `formatLongDate`). Drawer: kunci scroll, tutup via X / overlay / Escape / klik menu

### SidebarNav
- **Path:** apps/web/components/layout/SidebarNav.tsx
- **Dipakai di:** AppShell (sidebar & drawer)
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Item sidebar)
- **Pola kelas kunci:** item `h-11 rounded-field px-3 gap-3 text-[14.5px]` (drawer `touch`: `h-11.5 text-[15px]`) + ikon `size-4.75`; aktif `bg-accent-soft font-bold text-accent-strong`; hover `bg-glass-hover`; grup = tombol + chevron berputar, label grup `text-accent-strong` jika berisi halaman aktif; sub `h-9.5 pl-10.75 rounded-inner text-sm font-medium`, aktif `bg-accent/12 text-accent-strong`
- **Catatan:** ikon `tenants` (Building2) untuk menu super-admin. Grup dibuka/ditutup dengan klik (terbuka otomatis jika berisi halaman aktif). Aktif = tautan paling spesifik (`findStaffLink`). Prop `onNavigate` menutup drawer. Hitungan tertunda (pill `bg-inverse`) belum ada — tambah saat data tersedia (feature 15/20)

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
- **Catatan:** UserMenu prop `showChevron` (portal: false), `switchTo` portal|dashboard (feature 14 — item `h-11 rounded-inner text-sm font-bold hover:bg-accent/10` + ikon Clock/LayoutDashboard `text-text-secondary`, di atas Keluar; AppShell `showPortalLink` → "Absen saya", PortalShell peran non-karyawan → "Kembali ke dashboard"). Keluar = `<form action={logout}>`. UserAvatar prop `size` md|lg

### PortalShell / PortalBottomNav
- **Path:** apps/web/components/layout/PortalShell.tsx, PortalBottomNav.tsx
- **Dipakai di:** app/(portal)/layout.tsx — semua halaman /me
- **Referensi desain:** context/designs/me.html + design-tokens.html
- **Pola kelas kunci:** wrapper `mx-auto max-w-lg px-3.5 pt-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] gap-3.5`; header `glass sticky top-3 h-15 rounded-[20px]`; bottom nav mengambang `fixed inset-x-0 bottom-0 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]` → `glass h-18 rounded-[24px] p-1.5 grid-cols-5 gap-1`, item `rounded-[18px] text-xs`, aktif `bg-accent-soft font-bold text-accent-strong`, default `text-text-secondary`
- **Catatan:** maks 3 lapisan blur di portal (header, kartu utama, bottom nav) — card lain `surface-solid`. Beranda aktif hanya tepat di `/me`. Prop `inactive` (feature 37): karyawan nonaktif → hanya item `whenInactive` (Slip & Profil) `grid-cols-2`; layout portal mengisinya lewat `isInactiveEmployee()` (`lib/portalAccess.ts`)

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

### Badge
- **Path:** apps/web/components/common/Badge.tsx
- **Dipakai di:** /admin/tenants, /admin/tenants/[id], /settings/users (peran = neutral, Menunggu = warning, Kedaluwarsa = danger)
- **Referensi desain:** context/designs/design-tokens.html (badge status) + ui-rules "Badge Status"
- **Pola kelas kunci:** `inline-flex h-6.5 rounded-full px-2.75 text-[12.5px] font-bold`; tone warning `bg-warning-soft text-warning-text` · success `bg-success-soft text-success-text` · danger `bg-danger-soft text-danger-text` · accent `bg-accent-soft text-accent-deep` · neutral `bg-text-primary/6 text-text-secondary` · info `bg-info-soft text-info-text`
- **Catatan:** prop `tone` (`BadgeTone`: warning|success|danger|accent|neutral|info|outline — outline untuk status tidak aktif, mis. karyawan Nonaktif). Tanpa titik/ikon. Pakai untuk semua badge status berikutnya (izin, payroll, predikat KPI)

### StatTile
- **Path:** apps/web/components/common/StatTile.tsx
- **Dipakai di:** /admin/tenants, /dashboard, /compliance, /attendance, /payroll/*, dll.
- **Referensi desain:** context/designs/dashboard.html (stat tile)
- **Pola kelas kunci:** `glass-strong h-full min-h-30 lg:min-h-34 rounded-card p-5 gap-2.5`; label `text-sm text-text-secondary`; angka `font-display text-[26px] lg:text-num font-extrabold tabular-nums`; prefix `font-display text-[15px] lg:text-[17px] font-bold`; suffix `font-display text-base lg:text-xl font-semibold text-text-secondary`; catatan `text-[13px] text-text-tertiary`
- **Catatan:** props `label`, `value` (string terformat), `prefix?` (mis. "Rp"), `suffix?` (mis. "/14"), `note?`, `badge?`. `h-full` (feature 35) agar tinggi sama saat dibungkus `div` col-span. Label pendek bila ada badge (agar tidak terbungkus)

### Dialog
- **Path:** apps/web/components/common/Dialog.tsx
- **Dipakai di:** CreateTenantDialog, TenantStatusActions, InviteUserDialog, ChangeRoleDialog, RevokeMemberDialog, InvitationActions
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 07, izin user) — surface-glass-overlay untuk modal (ui-rules)
- **Pola kelas kunci:** native `<dialog>` `glass-overlay rounded-t-sheet sm:rounded-sheet sm:max-w-lg backdrop:bg-inverse/32`; mobile menempel di bawah layar; isi `p-6 sm:p-7 gap-5`; judul `font-display text-xl font-extrabold`; tombol tutup `size-11 rounded-field`; footer `flex-col-reverse sm:flex-row sm:justify-end gap-3`
- **Catatan:** client. Props `open`, `onClose`, `title`, `description?`, `footer?`, `dismissible` (false saat aksi berjalan → Escape/klik luar/X nonaktif). Fokus terkunci oleh browser (`showModal`). `text-left` wajib — dialog bisa dirender di dalam sel tabel rata kanan. Pakai untuk semua modal & konfirmasi

### Pagination
- **Path:** apps/web/components/common/Pagination.tsx
- **Dipakai di:** /admin/tenants
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 07, izin user)
- **Pola kelas kunci:** `flex justify-between`; rentang "1–20 dari 45" `text-small text-text-secondary tabular-nums`; tautan `buttonClassName({ variant: "secondary" })`, nonaktif `<Button variant="secondary" disabled>`
- **Catatan:** server component. Props `page`, `pageSize`, `total`, `hrefFor(page)`. Tidak tampil jika hanya 1 halaman

### TenantTable / TenantFilters
- **Path:** apps/web/components/admin/TenantTable.tsx, TenantFilters.tsx
- **Dipakai di:** /admin/tenants
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 07, izin user) — pola daftar di card (ui-rules "Cards")
- **Pola kelas kunci:** tabel (≥lg) di `glass-strong rounded-card overflow-hidden`: header `text-caption font-bold text-text-tertiary`, sel `px-4 py-3.5 first:pl-6 last:pr-6`, baris `border-t border-border-subtle hover:bg-glass-hover`, tautan menutupi baris (`after:absolute after:inset-0`, `tr relative`); mobile `ul` baris `px-5 py-4` (judul `text-[15px] font-bold` + Badge, sub `text-small`, caption). Filter: tab `h-10 rounded-full px-4`, aktif `bg-accent-soft font-bold text-accent-strong` + jumlah `tabular-nums`; cari = form GET `h-11 rounded-field` + ikon Search `left-3.5`
- **Catatan:** server component (filter tanpa JS). **Pola acuan untuk tabel data berikutnya** (/employees). MemberTable (feature 08) mengikuti pola ini tanpa ekstraksi — ekstrak `DataTable` umum saat dipakai ketiga kalinya (feature 11)

### CreateTenantDialog / TenantStatusActions / ResendOwnerInvitationButton
- **Path:** apps/web/components/admin/CreateTenantDialog.tsx, TenantStatusActions.tsx, ResendOwnerInvitationButton.tsx
- **Dipakai di:** /admin/tenants, /admin/tenants/[id]
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 07, izin user)
- **Pola kelas kunci:** Dialog + form `flex flex-col gap-4` (TextField) + tombol Batal (secondary) / aksi (primary; nonaktifkan = `dark`); hasil aksi = FormAlert success/danger
- **Catatan:** client; memanggil Server Action `actions/adminTenants.ts` lalu `router.refresh()` / `router.push`. Buat tenant sukses → detail `?created=1` (alert sukses). Konfirmasi wajib untuk nonaktifkan & aktifkan kembali

### AcceptInvitationForm
- **Path:** apps/web/components/auth/AcceptInvitationForm.tsx
- **Dipakai di:** /invite/[token]
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 07, izin user) — pola form auth (AuthShell)
- **Pola kelas kunci:** sama dengan ResetPasswordForm: AuthHeading + form `gap-4` + submit `size="lg" fullWidth mt-2`; email `TextField disabled`; state hasil = ikon status `size-11 rounded-field bg-<tone>-soft` + AuthHeading + tautan `buttonClassName({ size: "lg", fullWidth: true })`; caption masa berlaku `text-caption text-text-tertiary`
- **Catatan:** props `token`, `invitation` (`InvitationPreview | null`). State: akun baru (nama + password + konfirmasi), akun lama (cukup "Terima undangan"), kedaluwarsa, tidak valid, sukses. Dipakai juga undangan feature 08

### SessionEnded
- **Path:** apps/web/components/auth/SessionEnded.tsx
- **Dipakai di:** layout (main), (portal), (admin) — saat API menolak sesi
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 07, izin user)
- **Pola kelas kunci:** `BackdropShapes variant="auth"` + pill `glass-strong rounded-card px-6 py-4` + spinner `text-accent-strong`
- **Catatan:** client; memanggil Server Action `logout` (POST) sekali saat mount. **Jangan** ganti dengan route GET — browser bisa prefetch/prerender URL dari riwayat

### AppError (error boundary)
- **Path:** apps/web/app/error.tsx
- **Dipakai di:** semua halaman (error tak terduga, terutama API tidak terjangkau — `SessionUnavailableError`)
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 07, izin user) — pola EmptyState
- **Pola kelas kunci:** `BackdropShapes variant="auth"` + card `glass-strong rounded-card px-6 py-12 text-center`; ikon CloudOff `size-7 text-accent-strong`; tombol Coba lagi (primary)
- **Catatan:** Next 16: prop `retry` (bukan `reset`). Sesi tidak diakhiri. Kode `error.digest` ditampilkan sebagai caption

### RoleOptions
- **Path:** apps/web/components/users/RoleOptions.tsx
- **Dipakai di:** InviteUserDialog, ChangeRoleDialog (/settings/users)
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 08, izin user) — pola Input + item dropdown terpilih
- **Pola kelas kunci:** `fieldset` + legend `text-[13px] font-bold`; kartu `label` `rounded-field border border-border-control bg-control px-3.5 py-3 hover:border-border-control-hover has-checked:border-accent has-checked:bg-accent/10 has-focus-visible:ring-3 has-focus-visible:ring-accent/45`; radio native `size-4.5 accent-accent-strong`; judul `text-sm font-bold` + penjelasan `text-small text-text-secondary`; error `border-danger` + `text-caption text-danger-text`
- **Catatan:** props `legend`, `roles`, `value`, `onChange`, `error?`, `disabled?`. Nama grup dari `useId` (component bisa ada dua kali di DOM). Label & penjelasan dari `ROLE_LABELS` / `ROLE_DESCRIPTIONS` (`lib/roleLabels.ts`). Pola acuan untuk pilihan tunggal berpenjelasan berikutnya

### InviteUserDialog
- **Path:** apps/web/components/users/InviteUserDialog.tsx
- **Dipakai di:** /settings/users (aksi PageHeader)
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 08, izin user) — pola CreateTenantDialog
- **Pola kelas kunci:** Button primary + ikon UserPlus; Dialog + form `flex flex-col gap-4` (TextField nama, email, RoleOptions); state sukses = ikon MailCheck `size-11 rounded-field bg-success-soft text-success` + teks, tombol "Undang orang lain" (secondary) / "Selesai"
- **Catatan:** client; prop `assignableRoles` (dari API). Validasi `inviteUserSchema`; memanggil `actions/users.ts` lalu `router.refresh()`

### MemberTable / MemberActions / ChangeRoleDialog / RevokeMemberDialog
- **Path:** apps/web/components/users/MemberTable.tsx, MemberActions.tsx, ChangeRoleDialog.tsx, RevokeMemberDialog.tsx
- **Dipakai di:** /settings/users
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 08, izin user) — pola TenantTable + Dialog + DropdownMenu
- **Pola kelas kunci:** card `glass-strong rounded-card` **tanpa overflow-hidden** (dropdown di baris bawah tidak terpotong) + judul `font-display text-h2 font-bold` + sub `text-small`; tabel ≥lg (header `text-caption font-bold text-text-tertiary`, baris `border-t border-border-subtle`, tanpa hover karena baris bukan tautan); sel nama = UserAvatar + nama `text-[15px] font-bold` + "(Anda)" `text-caption text-text-tertiary` + email `text-small`; mobile `ul` baris `px-5 py-4`, badge + caption `pl-13 flex-wrap`; tombol aksi `size-10 rounded-field` ikon MoreHorizontal; item menu `min-h-11 rounded-inner`, "Cabut akses" `font-bold text-danger-text hover:bg-danger/8`; konfirmasi cabut = Button `dark`
- **Catatan:** MemberTable server component (props `members`, `tenantName`, `assignableRoles`); aksi hanya jika `member.canManage`. MemberActions client, membuka ChangeRoleDialog (tombol simpan nonaktif jika peran sama) / RevokeMemberDialog

### PendingInvitations / InvitationActions
- **Path:** apps/web/components/users/PendingInvitations.tsx, InvitationActions.tsx
- **Dipakai di:** /settings/users (tampil hanya jika ada undangan tertunda)
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 08, izin user) — pola card daftar + ResendOwnerInvitationButton
- **Pola kelas kunci:** card `glass-strong rounded-card` + judul `text-h2`; baris `border-t border-border-subtle px-5 py-4 lg:flex-row lg:justify-between`; nama `text-[15px] font-bold` + Badge peran (neutral) + status (warning "Menunggu" / danger "Kedaluwarsa"); caption "Dikirim … oleh … · berlaku sampai …"; aksi dua Button secondary (Kirim ulang, Batalkan) + FormAlert hasil
- **Catatan:** undangan yang tidak boleh dikelola (`canManage` false, mis. admin melihat undangan owner) menampilkan caption "Hanya pemilik yang bisa mengelola undangan ini". Batalkan lewat Dialog konfirmasi

### SelectField
- **Path:** apps/web/components/common/SelectField.tsx
- **Dipakai di:** /settings/company
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Input) — diturunkan dari TextField
- **Pola kelas kunci:** sama dengan TextField + `appearance-none pr-10`; ikon ChevronDown `absolute right-3.5 size-4.5 text-text-secondary pointer-events-none`
- **Catatan:** `<select>` native (aksesibel, picker bawaan HP). Props `id`, `label`, `error?`, `hint?` (ReactNode), `requiredMark?`, `labelHidden?` (label sr-only — baris filter), children `<option>` (placeholder = option `value=""`). Server-safe

### TextAreaField
- **Path:** apps/web/components/common/TextAreaField.tsx
- **Dipakai di:** /settings/company (alamat)
- **Referensi desain:** context/designs/dashboard.html + design-tokens.html (Input) — diturunkan dari TextField
- **Pola kelas kunci:** sama dengan TextField, `min-h-24 py-2.5 resize-y`, default `rows={3}`
- **Catatan:** props sama dengan TextField (tanpa `trailing`/`labelAction`). Server-safe

### CompanyProfileForm
- **Path:** apps/web/components/company/CompanyProfileForm.tsx
- **Dipakai di:** /settings/company
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 09, izin user)
- **Pola kelas kunci:** form = card `glass-strong rounded-card p-5 lg:p-7`; section `grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-8 border-t border-border-subtle py-6 first:border-t-0 first:pt-0` (kiri judul `text-h2` + penjelasan `text-small`, kanan field `gap-4`); pasangan field `grid sm:grid-cols-2 gap-4`; footer `border-t pt-6`: FormAlert hasil + caption "Terakhir diubah" `text-caption text-text-tertiary` + Button primary
- **Catatan:** client. Props `profile`, `provinces`. Provinsi → kab/kota bertahap (ganti provinsi mengosongkan kota). NPWP ditampilkan `formatNpwp`. Feature 30b: SelectField "Tutup buku absensi" (Akhir bulan / tanggal 1–28, hint rentang) berpasangan dengan Tanggal gajian `grid sm:grid-cols-2`, FormAlert warning bila `paydayBeforeCutoff` (dari shared). **Pola acuan form pengaturan berikutnya** (/settings/attendance, /settings/kpi, /settings/salary-components) — ekstrak `SettingsSection` saat dipakai kedua kalinya

### OrgListCard / AddOrgItemButton / OrgItemActions / OrgItemFormDialog / DeleteOrgItemDialog
- **Path:** apps/web/components/organization/OrgListCard.tsx, AddOrgItemButton.tsx, OrgItemActions.tsx, OrgItemFormDialog.tsx, DeleteOrgItemDialog.tsx
- **Dipakai di:** /organization
- **Referensi desain:** diturunkan dari pola snapshot glassmorphism (tanpa snapshot halaman ini — feature 10, izin user) — pola card daftar feature 08 + Dialog + DropdownMenu
- **Pola kelas kunci:** halaman `grid items-start lg:grid-cols-2 gap-4 lg:gap-5`; card `glass-strong rounded-card` (tanpa overflow-hidden); header `px-5 pt-5 pb-3 lg:px-6` judul `text-h2` + jumlah `font-medium text-text-tertiary tabular-nums` + penjelasan `text-small`, tombol secondary "Tambah" di kanan (hanya jika daftar tidak kosong); baris `min-h-15 border-t border-border-subtle px-5 py-2.5 lg:px-6` nama `text-[15px] font-bold` + caption tanggal; kosong = `EmptyState surface="none"` + CTA primary "Tambah <nama>"
- **Catatan:** OrgListCard server component (props `kind`, `items`, `canManage` — atasan tanpa aksi). Menu aksi = pola MemberActions (Ubah nama / Hapus `text-danger-text`). OrgItemFormDialog dipakai untuk tambah (tanpa `item`) & ubah nama (`item`); konfirmasi hapus Button `dark`. Teks per daftar di `lib/organizationLabels.ts`. Pola acuan untuk daftar master sederhana berikutnya

### SegmentedControl
- **Path:** apps/web/components/common/SegmentedControl.tsx
- **Dipakai di:** /employees (filter Aktif/Nonaktif/Semua), form karyawan (status kerja), /settings/kpi (siklus), /kpi/reviews/[id] (nilai 1–5 — tanpa pilihan, opsi pertama tetap bisa difokus Tab)
- **Referensi desain:** context/designs/design-tokens.html ("segmented"), employees.html
- **Pola kelas kunci:** track `rounded-full bg-segment-track p-1 gap-0.5`; opsi `h-9 (lg: h-10) px-4 rounded-full text-sm`; terpilih `bg-surface-solid font-bold shadow-segment`, lainnya `font-medium text-text-secondary`
- **Catatan:** client, generik `<T extends string>`. Radio group (panah kiri/kanan, satu tab stop). `fullWidth` = kolom sama rata (mobile). Untuk **filter/pilihan**, bukan navigasi (navigasi antar-bagian = tab bar)

### FormSection
- **Path:** apps/web/components/common/FormSection.tsx
- **Dipakai di:** /employees/new, /employees/[id] (tampilan baca & mode ubah)
- **Referensi desain:** context/designs/employees-new.html, employees-detail.html ("form-section")
- **Pola kelas kunci:** `glass-strong rounded-card p-4.5 lg:p-7 grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10`; judul `font-display text-base lg:text-[17px] font-bold`; isi field `grid gap-x-4 gap-y-5 sm:grid-cols-2`
- **Catatan:** server-safe. Props `title`, `description?`, `lockNote?` (ikon gembok — data sensitif), `aside?` (mis. tombol Tampilkan; mobile di kanan judul — dirender dua kali, jadi harus stateless). Berbeda dengan section di CompanyProfileForm (section di dalam satu card): di sini **tiap section = card sendiri** — pola untuk form panjang

### Combobox
- **Path:** apps/web/components/common/Combobox.tsx
- **Dipakai di:** form karyawan (Nama bank)
- **Referensi desain:** context/designs/employees-new.html ("Combobox bank")
- **Pola kelas kunci:** input = TextField + ikon Search `pl-10.5`; daftar `glass-overlay rounded-[18px] p-2 max-h-72`; opsi `min-h-11 rounded-inner px-3` (label bold + description caption), aktif `bg-accent/10`, terpilih ikon Check `text-accent-strong`
- **Catatan:** client. Props `options {value,label,description?}`, `value: string|null`, `onChange`. ARIA combobox (panah, Enter, Escape), "Kosongkan pilihan". Untuk daftar panjang (>10) yang perlu dicari; daftar pendek tetap SelectField

### Banner
- **Path:** apps/web/components/common/Banner.tsx
- **Dipakai di:** form karyawan (error simpan / "N isian perlu diperbaiki"), detail karyawan (Nonaktif sejak …), /compliance (MinimumWageBanner)
- **Referensi desain:** context/designs/design-tokens.html ("banner")
- **Pola kelas kunci:** `rounded-[18px] border px-4.5 py-3.5`; neutral `border-border-neutral bg-surface-solid/92`, danger `border-danger-border bg-danger-surface`, warning `border-warning-border bg-warning-surface`; ikon 20px, judul `text-[14.5px] font-bold`
- **Catatan:** server-safe. Props `tone`, `title`, `description?`, `action?`, `icon?`. Selebar konten halaman; FormAlert tetap untuk pesan kecil di dalam form/dialog

### EmployeeTable / EmployeeFilters / EmployeeAvatar
- **Path:** apps/web/components/employees/EmployeeTable.tsx, EmployeeFilters.tsx, EmployeeAvatar.tsx
- **Dipakai di:** /employees
- **Referensi desain:** context/designs/employees.html ("data-table", "filter-bar")
- **Pola kelas kunci:** tabel `glass-data rounded-card`, thead `bg-table-head h-11` teks `text-caption font-bold text-text-secondary whitespace-nowrap`, baris `h-16 border-t hover:bg-row-hover` (tautan menutupi baris), baris nonaktif `text-text-tertiary` + avatar netral + Badge outline; footer tabel = Pagination / "Menampilkan x–y dari n"; mobile = card `glass-data rounded-[20px]`. Filter desktop = panel `glass rounded-card p-2.5` (cari + 2 SelectField `labelHidden` + SegmentedControl), mobile = cari + segmented + tombol Filter → Dialog
- **Catatan:** EmployeeTable server-safe, prop `compact` = tampilan atasan (Nama, Jabatan, Status, Tanggal masuk). Kolom Keterangan dari `employeeNote()` (kontrak/percobaan ≤30 hari = peringatan) + feature 34: prop `minimumWage` (dari `EmployeeList`) → `minimumWageNote()` "Di bawah UMP 2026" / "… mulai 1 Jan 2027" (warn) di atas catatan lain, bertumpuk `flex-col gap-0.5`. Filter di URL (`employeesHref` di lib/employeeLabels.ts — **jangan ekspor helper dari modul "use client" untuk dipanggil server**). EmployeeAvatar = inisial di `bg-shape-sand` (beda dengan UserAvatar gelap untuk akun login). **Pola acuan tabel data berikutnya** (rekap absensi, payroll)

### EmployeeForm
- **Path:** apps/web/components/employees/EmployeeForm.tsx
- **Dipakai di:** /employees/new, /employees/[id] (mode ubah)
- **Referensi desain:** context/designs/employees-new.html, employees-detail.html (mode ubah)
- **Pola kelas kunci:** 5 FormSection; Banner danger di atas saat gagal; bar aksi `glass-data sticky bottom-2.5 rounded-[26px] p-2.5` (mobile, grid Batal 1fr / Simpan 1.6fr, tombol lg) → `lg:static lg:rounded-card` inline dengan catatan di kiri
- **Catatan:** client. Props `id` (form id — tombol di header memakai `form={id}`), `options`, `employee?` (ada = ubah), `onCancel?`, `onSaved?`, `onSubmittingChange?`. Field sensitif **tidak pernah diisi ulang**: placeholder = nilai tersamar + hint "Kosongkan jika tidak diubah"

### EmployeeDetailView / EmployeeDataSections / DeactivateEmployeeDialog
- **Path:** apps/web/components/employees/EmployeeDetailView.tsx, EmployeeDataSections.tsx, DeactivateEmployeeDialog.tsx
- **Dipakai di:** /employees/[id]
- **Referensi desain:** context/designs/employees-detail.html
- **Pola kelas kunci:** header avatar `lg` + nama `text-[22px] lg:text-h1` + meta + Badge; aksi Ubah (secondary) + ⋯ DropdownMenu (item bahaya `text-danger-text`); **tab bar** `border-b border-text-primary/10 gap-7`, tab `h-11.5 text-[15px]`, aktif `font-bold shadow-[inset_0_-2px_0_var(--color-accent)]`; field baca `dt text-[13px] text-text-tertiary` / `dd text-[15px] font-medium`, nilai tersamar `tracking-[0.04em]`
- **Catatan:** client. Tab = Link `?tab=` (feature 37b; prop `tab` + `tabContent` dari page). Tab Gaji = EmployeeSalaryTab (feature 28, owner/admin — prop `salary` null = tab disembunyikan); KPI = EmployeeKpiTab, Absensi = EmployeeAttendanceTab (feature 37b). Tombol Tampilkan → Server Action `revealSensitive` (nilai penuh hanya di state komponen, tiap buka = 1 audit). Atasan: tanpa aksi, tanpa section pajak & rekening (API mengirim `confidential: null`). Dialog nonaktifkan: tanggal keluar (default hari ini) + alasan, Button `danger`

### FileDropzone
- **Path:** apps/web/components/common/FileDropzone.tsx
- **Dipakai di:** /employees/import
- **Referensi desain:** diturunkan dari Input design-tokens.html (tanpa snapshot — feature 12, izin user)
- **Pola kelas kunci:** label `min-h-44 rounded-field border-2 border-dashed border-border-control bg-control px-5 py-8 text-center`, hover `border-accent bg-surface-solid`, drag `border-accent bg-accent/6`, error `border-danger`; fokus `has-[:focus-visible]:ring-3 ring-accent/45`; ikon Upload `size-6 text-text-secondary` (loading: LoaderCircle spin `text-accent-strong`); judul `text-[15px] font-bold`, hint `text-caption text-text-tertiary`
- **Catatan:** client. Props `id`, `accept`, `hint`, `onSelect(file)`, `loading?`, `loadingLabel?`, `disabled?`, `error?`. Input file asli `sr-only` (tetap bisa difokus keyboard), dikosongkan setelah memilih agar file yang sama bisa dipilih lagi. Pakai ulang untuk lampiran izin (feature 15) & foto bukti tugas (feature 19)

### EmployeeImportFlow / ImportPreviewTable
- **Path:** apps/web/components/employees/EmployeeImportFlow.tsx, ImportPreviewTable.tsx
- **Dipakai di:** /employees/import
- **Referensi desain:** diturunkan dari pola employees-new.html (FormSection, action bar) + employees.html (data-table) — tanpa snapshot halaman ini (feature 12, izin user)
- **Pola kelas kunci:** langkah pilih = 2 FormSection ("1. Unduh template" tautan `<a>` bergaya secondary, "2. Unggah file" FileDropzone); pratinjau = card file `glass-strong rounded-card` (nama `font-display font-bold` + ringkasan `text-small tabular-nums` + Periksa ulang/Ganti file secondary), Banner warning/danger, SegmentedControl filter (Perlu diperbaiki/Siap/Semua — mobile `fullWidth`, label "Salah"), tabel `glass-data rounded-card` pola EmployeeTable (kolom Baris, Nama, Jabatan · Departemen, Status kerja, Tanggal masuk, Hasil pemeriksaan; sel `align-top`), kesalahan `li text-small` = kolom `font-bold text-danger-text` + pesan `text-text-secondary`, baris valid Badge success "Siap diimpor"; mobile card `glass-data rounded-[20px]`; action bar = pola EmployeeForm (sticky mobile); selesai = EmptyState ikon CircleCheck success + 2 tombol
- **Catatan:** EmployeeImportFlow client, state `select → preview → done`; File disimpan di state browser dan dikirim ulang saat konfirmasi (Server Action `previewEmployeeImport` / `importEmployees`). Prop `templateError` dari `?template=error`. ImportPreviewTable server-safe (props `rows`)

### WorkScheduleForm
- **Path:** apps/web/components/attendance/WorkScheduleForm.tsx
- **Dipakai di:** /settings/attendance (di dalam FormSection "Jadwal kerja")
- **Referensi desain:** tanpa referensi — diturunkan dari pola FormSection + SegmentedControl (feature 13, izin user; tercatat di progress-tracker)
- **Pola kelas kunci:** judul kolom desktop `grid-cols-[96px_auto_minmax(0,1fr)_minmax(0,1fr)] text-caption font-bold text-text-secondary`; baris `border-t border-border-subtle py-3`, nama hari `text-[15px] font-bold` (libur `text-text-tertiary`); SegmentedControl Kerja/Libur; TextField `type="time"` dengan `labelClassName="lg:sr-only"` (mobile: label terlihat, grid 2 kolom); footer `border-t pt-5` ringkasan "N hari kerja per minggu · Terakhir diubah" + tombol primary "Simpan jadwal"
- **Catatan:** client. Jam hari libur dinonaktifkan tapi tetap tersimpan. Error per hari dari `workScheduleInputSchema` (path `days[i]`), error umum (mis. tidak ada hari kerja) lewat FormAlert. Server Action `saveWorkSchedule`

### CalendarDate
- **Path:** apps/web/components/attendance/CalendarDate.tsx
- **Dipakai di:** /settings/attendance (daftar libur), /me/attendance (riwayat)
- **Referensi desain:** ui-rules "Tanggal di daftar pengingat"
- **Pola kelas kunci:** kolom `w-11` — tanggal `font-display text-xl font-extrabold tabular-nums` + bulan `text-xs text-text-tertiary`
- **Catatan:** server-safe. Prop `date` (YYYY-MM-DD), `muted`. Pakai ulang untuk kalender kepatuhan (feature 33)

### NationalHolidayList / NationalHolidayActions
- **Path:** apps/web/components/attendance/NationalHolidayList.tsx, NationalHolidayActions.tsx
- **Dipakai di:** /settings/attendance
- **Referensi desain:** tanpa referensi — pola daftar OrgListCard + OrgItemActions (feature 13)
- **Pola kelas kunci:** baris `min-h-15 border-t border-border-subtle py-2.5 first:border-t-0` = CalendarDate + judul `text-[14.5px] font-bold` + sub `text-small text-text-secondary` ("Hari · Libur nasional/Cuti bersama · di luar hari kerja"); tanggal "tetap masuk" diredupkan + Badge `outline` "Tetap masuk"; menu ⋯ DropdownMenu satu item (Tetap masuk kerja / Jadikan hari libur)
- **Catatan:** List server-safe (props `holidays`, `workdays`); Actions client → Server Action `setNationalHolidayObservance` + `router.refresh()`, trigger pulse saat berjalan, error kecil di samping menu

### CompanyHolidayList / CompanyHolidayActions / CompanyHolidayFormDialog / DeleteCompanyHolidayDialog / AddCompanyHolidayButton
- **Path:** apps/web/components/attendance/
- **Dipakai di:** /settings/attendance
- **Referensi desain:** tanpa referensi — pola OrgListCard/OrgItemFormDialog/DeleteOrgItemDialog (feature 13)
- **Pola kelas kunci:** baris sama dengan NationalHolidayList; kosong = teks `text-sm text-text-secondary` "Belum ada libur usaha di {tahun}"; dialog: TextField `type="date"` + Keterangan; tombol tambah secondary "Tambah" di kanan judul grup; hapus = Button `dark`
- **Catatan:** client (kecuali List). Simpan libur di tahun lain dari yang ditampilkan → pindah ke `?year=` tahun itu. Tanggal ganda → 409 dari API ditampilkan di FormAlert

### HolidayYearSwitch
- **Path:** apps/web/components/attendance/HolidayYearSwitch.tsx
- **Dipakai di:** /settings/attendance (aside FormSection "Hari libur")
- **Referensi desain:** SegmentedControl (design-tokens "segmented")
- **Pola kelas kunci:** SegmentedControl pilihan tahun
- **Catatan:** client. Tahun di URL `?year=` (tahun berjalan tanpa param) via `attendanceSettingsHref`; `router.push` dalam transition (kontrol dikunci saat memuat)

### WorkingDaysSummary
- **Path:** apps/web/components/attendance/WorkingDaysSummary.tsx
- **Dipakai di:** /settings/attendance (FormSection "Hari kerja {tahun}")
- **Referensi desain:** tanpa referensi (feature 13)
- **Pola kelas kunci:** grid `grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2`, sel `rounded-inner bg-fill-subtle px-3 py-2.5` (bulan berjalan `bg-accent-soft` + label `text-accent-strong font-bold`, `aria-current="date"`), bulan `text-caption text-text-tertiary`, angka `font-display text-xl font-extrabold tabular-nums`; total `text-small`
- **Catatan:** server-safe. Angka dari API (`workingDaysByMonth`) — tidak menghitung di web

### AttendanceCard / AttendanceStatusRow
- **Path:** apps/web/components/attendance/AttendanceCard.tsx, AttendanceStatusRow.tsx
- **Dipakai di:** /me
- **Referensi desain:** context/designs/me.html (frame "Sebelum absen" / "Sesudah absen masuk")
- **Pola kelas kunci:** card `glass-strong rounded-[24px] p-5 gap-4` (salah satu dari 3 lapisan blur portal); baris atas `text-[13.5px] text-text-secondary` ("Jam server · WITA" | nama libur / Hari kerja); jam `font-display text-[68px] leading-[0.95] font-extrabold tracking-[-0.04em] tabular-nums`; tanggal `text-[15px] font-bold`; jadwal `text-sm text-text-secondary`; tombol Button `lg fullWidth` primary "Absen Masuk" (LogIn) / `dark` "Absen Pulang" (LogOut); baris status `rounded-[14px] px-3.5 py-3` + ikon `size-4.5` + teks `text-[14.5px] font-bold` — tone success `bg-success-soft text-success-text` · warning (telat) `bg-warning-soft text-warning-text` · neutral `bg-fill-subtle`; catatan lokasi MapPin `text-[13px] text-text-secondary`
- **Catatan:** AttendanceCard client, prop `today` (`AttendanceToday`). Jam berdetak dari jam server (offset), refresh saat lewat tengah malam lokal. Tombol: ambil lokasi (`lib/geolocation.ts`, label "Mengambil lokasi…") → Server Action `checkIn`/`checkOut` ("Menyimpan…"); error FormAlert danger. `access` ≠ ok → FormAlert info tanpa tombol. Selesai = teks "Absen hari ini selesai". Label status di `lib/attendanceLabels.ts`. AttendanceStatusRow server-safe

### AttendanceMonthNav / AttendanceSummary / AttendanceHistoryList
- **Path:** apps/web/components/attendance/AttendanceMonthNav.tsx, AttendanceSummary.tsx, AttendanceHistoryList.tsx
- **Dipakai di:** /me/attendance
- **Referensi desain:** tanpa snapshot — diturunkan dari pola me.html (tile "Kehadiran bulan ini", card solid) (feature 14, izin user)
- **Pola kelas kunci:** nav bulan `surface-solid rounded-[20px] p-1.5` + panah `size-11 rounded-field hover:bg-fill-subtle` + label `font-display text-[17px] font-bold` (bulan depan dari bulan berjalan = panah `text-text-muted` nonaktif); tile `surface-solid rounded-[20px] p-4 gap-1.5` grid 2 kolom (label `text-[13px]`, angka `font-display text-[30px] font-extrabold tabular-nums` + satuan `text-[13px] font-bold`, catatan `text-[12.5px] text-text-tertiary`); daftar `surface-solid rounded-card px-4.5 pt-4.5` judul `text-[17px] font-bold`, baris `border-t border-border-subtle py-3.5` = CalendarDate + hari `text-[14.5px] font-bold` + jam `text-small tabular-nums` + Badge status (success Tepat waktu / warning Telat / neutral Di luar hari kerja)
- **Catatan:** semua server component. Bulan di URL `?month=YYYY-MM` (`myAttendanceHref`). Kosong = EmptyState `surface="solid"`. Ringkasan hadir, telat, + tile "Izin & cuti" (grid 3 kolom, prop `leave`, feature 15); riwayat menggabungkan hari izin disetujui (Badge `info` jenis). Catatan tile Hadir = "Alpa n hari" / "Tanpa alpa" (`summary.absent`, feature 37). Pola acuan halaman daftar portal berikutnya (slip, tugas)

### NewLeaveRequestButton / LeaveRequestFormDialog
- **Path:** apps/web/components/attendance/NewLeaveRequestButton.tsx, LeaveRequestFormDialog.tsx
- **Dipakai di:** /me/attendance (aksi PageHeader)
- **Referensi desain:** tanpa referensi — pola CompanyHolidayFormDialog + FileDropzone (feature 15, izin user)
- **Pola kelas kunci:** tombol primary + ikon CalendarPlus (`max-sm:w-full`); dialog: SegmentedControl `fullWidth size="lg"` jenis, grid 2 kolom TextField `type="date"` (Mulai/Sampai), TextAreaField alasan (placeholder per jenis), lampiran = FileDropzone → setelah dipilih baris file `rounded-field border-border-control bg-control` (FileText + nama bold + ukuran caption + tombol X 44px)
- **Catatan:** client. Validasi `leaveRequestInputSchema` + cek ekstensi/ukuran di client; Server Action `submitLeaveRequest(FormData)`. Default tanggal = `today` dari API (zona waktu usaha)

### MyLeaveRequestList / CancelLeaveRequestButton
- **Path:** apps/web/components/attendance/MyLeaveRequestList.tsx, CancelLeaveRequestButton.tsx
- **Dipakai di:** /me/attendance
- **Referensi desain:** tanpa referensi — pola AttendanceHistoryList (feature 15)
- **Pola kelas kunci:** card `surface-solid rounded-card px-4.5 pt-4.5`; baris = CalendarDate (tanggal mulai, redup jika ditolak/batal) + "Jenis · N hari kerja" `text-[14.5px] font-bold` + rentang `text-small tabular-nums` + alasan + keputusan (ditolak `text-danger-text`) + Badge status (warning/success/danger/neutral); tautan lampiran Paperclip `text-accent-strong font-bold`; "Batalkan" teks `text-danger-text` → Dialog konfirmasi Button `dark`
- **Catatan:** List server-safe; Cancel client → Server Action `cancelLeaveRequest` + `router.refresh()`. Label/tone di `lib/leaveLabels.ts` (`formatDateRange`, `LEAVE_STATUS_TONES`)

### LeaveRequestTable / LeaveDecisionActions / LeaveRequestFilter
- **Path:** apps/web/components/attendance/LeaveRequestTable.tsx, LeaveDecisionActions.tsx, LeaveRequestFilter.tsx
- **Dipakai di:** /attendance/requests
- **Referensi desain:** tanpa referensi — pola EmployeeTable + Dialog (feature 15, izin user)
- **Pola kelas kunci:** tabel `glass-data rounded-card` kolom Karyawan (EmployeeAvatar + nama + jabatan) · Jenis · Tanggal · Alasan (`line-clamp-3` + lampiran) · Status (Badge + tombol Tolak secondary / Setujui primary, atau catatan keputusan `text-small text-text-secondary`), sel `align-top py-3.5`; mobile card `glass-data rounded-[20px]` + tombol grid 2 kolom; filter SegmentedControl "Menunggu (n) / Disetujui / Ditolak / Semua"
- **Catatan:** Table server-safe; Actions client (dirender dua kali → id textarea pakai `useId`): dialog menampilkan ringkasan + alasan karyawan, catatan opsional saat setuju, alasan wajib saat tolak (Button `danger`). Filter client, `?status=` via `leaveRequestsHref`

### AttendancePeriodNav
- **Path:** apps/web/components/attendance/AttendancePeriodNav.tsx
- **Dipakai di:** /attendance, /attendance/corrections
- **Referensi desain:** tanpa referensi — pola AttendanceMonthNav + panel filter EmployeeFilters (feature 16, izin user)
- **Pola kelas kunci:** panel `glass rounded-card p-2 sm:p-2.5 flex flex-wrap sm:flex-nowrap`; panah `size-11 rounded-field hover:bg-fill-subtle`; label periode `font-display text-[17px] font-bold tabular-nums sm:min-w-44`; kanan tautan teks "Per bulan" (`text-accent-strong font-bold`, hanya mode rentang) + Button secondary CalendarRange "Pilih/Ubah rentang" (mobile `w-full` di baris kedua); dialog grid 2 kolom TextField `type="date"`
- **Catatan:** client. Props `view` (`PeriodView` month|range dari `lib/attendanceRecapLabels.ts`), `currentMonth` (bulan setelahnya = panah nonaktif `text-text-muted`), `from`/`to` (isi awal dialog), `basePath`, `keep` (param lain yang dipertahankan, mis. `employee`). Validasi `attendancePeriodQuerySchema` (maks. 92 hari). URL: bulan berjalan tanpa param, `?month=YYYY-MM`, `?from=&to=`. Feature 30b: prop `caption` (rentang `text-caption text-text-tertiary` di bawah nama bulan, dari `periodRangeCaption` bila periode ≠ bulan kalender); `currentMonth` rekap/koreksi = `recap.currentMonth` (bulan payroll menurut tutup buku)

### AttendanceRecapTable
- **Path:** apps/web/components/attendance/AttendanceRecapTable.tsx
- **Dipakai di:** /attendance
- **Referensi desain:** tanpa referensi — pola EmployeeTable (feature 16, izin user)
- **Pola kelas kunci:** tabel `glass-data rounded-card`, thead `bg-table-head h-11`, baris `h-16`; kolom Karyawan (EmployeeAvatar + nama + jabatan, "· Nonaktif") · Hadir `present/workingDays` (penyebut `text-small text-text-tertiary`, "+N hari libur") · Telat (jumlah + durasi caption) · Alpa · Izin · Sakit · Cuti · Tanpa pulang · "Rincian ›"; angka `font-display text-[17px] font-bold tabular-nums` — 0 `text-text-tertiary`, alpa `text-danger-text`, telat/tanpa pulang `text-warning-text`; mobile card `glass-data rounded-[20px]` + `dl` grid 4 kolom (Hadir, Telat, Alpa, Izin·Sakit·Cuti) + catatan `text-small`
- **Catatan:** server component. Props `rows`, `detailHref` (fungsi → null untuk atasan = tanpa kolom Rincian), `footer`. Di halaman: di atasnya 4 StatTile (Alpa, Telat, Izin/sakit/cuti, Tanpa absen pulang) grid `grid-cols-2 lg:grid-cols-4`

### CorrectionEmployeeSelect / AttendanceDayList / CorrectAttendanceButton / AttendanceCorrectionList
- **Path:** apps/web/components/attendance/CorrectionEmployeeSelect.tsx, AttendanceDayList.tsx, CorrectAttendanceButton.tsx, AttendanceCorrectionList.tsx
- **Dipakai di:** /attendance/corrections
- **Referensi desain:** tanpa referensi — pola AttendanceHistoryList (CalendarDate + judul + sub + Badge) di card glass-data + Dialog (feature 16, izin user)
- **Pola kelas kunci:** select = panel `glass rounded-card p-2 sm:p-2.5 lg:w-96` + SelectField `labelHidden`; daftar harian `glass-data rounded-card px-4.5 pt-4.5 lg:px-6` dengan kepala EmployeeAvatar `md` + nama `text-[17px] font-bold` + ringkasan `text-small tabular-nums`, baris `border-t py-3` = CalendarDate (redup jika bukan hari kerja) + hari bold + jam `text-small` + Badge status (`DAY_STATUS_TONES`: success tepat waktu, warning telat, danger alpa, info izin/sakit/cuti, neutral libur/belum absen) + "Dikoreksi" `text-caption text-text-tertiary` + Button secondary "Koreksi"; dialog: kotak "Sekarang: …" `rounded-inner bg-fill-subtle`, grid 2 kolom TextField `type="time"` (masuk wajib, pulang opsional), TextAreaField alasan; riwayat = card `glass-data` baris CalendarDate + "Absen ditambahkan · Masuk …" / "Masuk 08:30 → 08:00" + alasan + "Oleh … · tanggal" caption
- **Catatan:** Select client (navigasi `correctionsHref`, periode dipertahankan). DayList server: tanggal > hari ini & di luar masa kerja disembunyikan, terbaru di atas; tombol hanya jika `canCorrect` dari API. Button client (`useId`), validasi `attendanceCorrectionInputSchema`, Server Action `correctAttendance` + `router.refresh()`. Label status di `lib/attendanceRecapLabels.ts` (`dayStatusLabel`)

### MoneyField
- **Path:** apps/web/components/common/MoneyField.tsx
- **Dipakai di:** /settings/attendance (aturan potongan & pratinjau)
- **Referensi desain:** tanpa referensi — diturunkan dari TextField (feature 17, izin user)
- **Pola kelas kunci:** TextField + `leading="Rp"` (`text-body text-text-secondary`, input `pl-10`), `inputMode="numeric"`, `tabular-nums`
- **Catatan:** client. `value` = digit rupiah penuh tanpa pemisah (string, bukan number), tampil dengan pemisah ribuan titik; helper di `lib/money.ts` (`sanitizeMoneyInput`, `groupThousands`, `moneyDigits`). Pakai untuk semua isian uang berikutnya (komponen gaji, THR)

### DeductionRulesEditor / DeductionRuleFields / DeductionPreviewResult / DeductionRuleVersionList
- **Path:** apps/web/components/attendance/DeductionRulesEditor.tsx, DeductionRuleFields.tsx, DeductionPreviewResult.tsx, DeductionRuleVersionList.tsx
- **Dipakai di:** /settings/attendance (3 FormSection setelah "Hari kerja": Aturan potongan absensi, Pratinjau potongan, Riwayat aturan potongan)
- **Referensi desain:** tanpa referensi — pola FormSection + SelectField + daftar berpemisah (feature 17, izin user; tercatat di progress-tracker)
- **Pola kelas kunci:** grup aturan `border-t border-border-subtle py-5 first:border-t-0` judul `text-[15px] font-bold` + penjelasan `text-small`, isian `grid sm:grid-cols-2 gap-x-4 gap-y-5` (SelectField cara potong + isian tambahan sesuai mode); footer `border-t pt-5` TextField `type="date"` "Berlaku mulai" + FormAlert warning (versi terjadwal tergantikan) + Button primary "Simpan aturan"; pratinjau: Button secondary "Hitung pratinjau", baris rincian = label `text-[14.5px] font-bold` + nominal `font-display text-[17px] font-bold tabular-nums` + langkah `text-small`, total `dl rounded-inner bg-fill-subtle` angka `font-display text-xl font-extrabold`; riwayat: rentang tanggal bold + Badge (success Berlaku / info Terjadwal / outline Berakhir) + `dl sm:grid-cols-[120px_minmax(0,1fr)]` ringkasan aturan
- **Catatan:** Editor client (satu state draf untuk form & pratinjau — pratinjau memakai aturan di form yang belum disimpan). Draf ↔ aturan & label di `lib/attendanceDeductionLabels.ts` (`draftFromRules`, `rulesInputFromDraft`, `draftErrorsFrom`, `rulesSummary`); validasi `attendanceDeductionRulesSchema`. Server Action `saveAttendanceDeductionRules` / `previewAttendanceDeduction`. PreviewResult & VersionList server-safe; angka & langkah dari API (payroll-engine), web tidak menghitung

### KpiTemplateCard / KpiTemplateActions / DeleteKpiTemplateDialog / AddBuiltinKpiTemplatesButton
- **Path:** apps/web/components/kpi/KpiTemplateCard.tsx, KpiTemplateActions.tsx, DeleteKpiTemplateDialog.tsx, AddBuiltinKpiTemplatesButton.tsx
- **Dipakai di:** /kpi/templates
- **Referensi desain:** tanpa referensi — pola OrgListCard + OrgItemActions + Dialog (feature 18, izin user)
- **Pola kelas kunci:** halaman `grid items-start lg:grid-cols-2 gap-4 lg:gap-5`; card `glass-strong rounded-card` (tanpa overflow-hidden), header `px-5 pt-5 pb-3 lg:px-6` judul `text-h2` + Badge neutral "Bawaan" + keterangan `text-small` + "Jabatan: …" (kosong = `text-warning-text` "Belum dipakai jabatan mana pun"); baris indikator `border-t border-border-subtle px-5 py-3 lg:px-6` nama `text-[14.5px] font-bold` + "Tipe · target" `text-small`, bobot kanan `font-display text-[17px] font-bold tabular-nums` + "%" `text-small text-text-tertiary`
- **Catatan:** Card server component. Actions client: DropdownMenu Ubah (Link) / Salin jadi template baru (`/kpi/templates/new?from=id`) / Hapus (dialog, Button `dark`, menyebut jumlah jabatan yang kehilangan template). AddBuiltin: Server Action `addBuiltinKpiTemplates` + `router.refresh()`, primary di empty state, secondary di Banner neutral. Halaman: Banner warning "N jabatan belum punya template KPI"

### KpiTemplateForm / KpiIndicatorFields / KpiPositionPicker / KpiTemplateFormSkeleton / KpiTemplatesBackLink
- **Path:** apps/web/components/kpi/KpiTemplateForm.tsx, KpiIndicatorFields.tsx, KpiPositionPicker.tsx, KpiTemplateFormSkeleton.tsx, KpiTemplatesBackLink.tsx
- **Dipakai di:** /kpi/templates/new, /kpi/templates/[id]
- **Referensi desain:** tanpa referensi — pola FormSection + action bar EmployeeForm (feature 18, izin user)
- **Pola kelas kunci:** 2 FormSection (Template, Indikator); indikator `li border-t border-border-subtle py-5 first:border-t-0` judul `text-[15px] font-bold` + tombol hapus ikon `size-10 rounded-field hover:bg-danger/8`; grid Tipe|Bobot `sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`, Target|Satuan|Waktu `sm:grid-cols-3`; akhiran "%" lewat `trailing` TextField; footer section: "Total bobot N%" `text-[14.5px] font-bold tabular-nums` + catatan `text-success-text` (pas) / `text-warning-text` (kurang/lebih) + Button secondary "Tambah indikator"; pemilih jabatan = `fieldset` + `ul rounded-field border border-border-control bg-control`, baris `label min-h-12` checkbox native `size-4.5 accent-accent`, template lain = caption `text-text-tertiary` (dicentang → `text-warning-text` "Dipindahkan dari …"); action bar `glass-data sticky bottom-2.5 … lg:static` sama dengan EmployeeForm
- **Catatan:** Form client; draf teks (target tampil "1.500.000,5", bobot string) ↔ input API di `lib/kpiTemplateLabels.ts` (`draftFromTemplate` edit/copy, `templateInputFromDraft`, `sanitizeTargetInput`, `weightTotal`, `formatIndicatorTarget`, label tipe/waktu). Validasi `kpiTemplateInputSchema`, error dipetakan per indikator (kunci `key`). Belum ada komponen Checkbox umum — ekstrak ke `common/` saat dipakai kedua kalinya

### TaskSummaryCard / TaskIndicatorRow / LogTaskButton
- **Path:** apps/web/components/tasks/TaskSummaryCard.tsx, TaskIndicatorRow.tsx, LogTaskButton.tsx
- **Dipakai di:** /me (kartu "Tugas hari ini"), /me/tasks (ringkasan tanggal terpilih + tombol header)
- **Referensi desain:** context/designs/me.html ("Tugas hari ini")
- **Pola kelas kunci:** card `surface-solid rounded-[22px] px-4.5 pt-4.5 pb-2` (bukan kaca — portal maks 3 blur); judul `font-display text-[17px] font-bold` + "Template X" `text-[13px] text-text-secondary`; baris `border-t border-border-subtle py-3.5 gap-2.25` nama `text-[14.5px] font-bold` + nilai `font-display text-[15px] font-extrabold tabular-nums` ("86 / 120" target harian, total saja untuk mingguan/bulanan); bar `h-2 rounded-full bg-fill` isi `bg-accent` / `bg-success` / `bg-danger` (lebar inline style); Badge status (neutral Belum dicatat / warning Menunggu verifikasi / success / danger) + keterangan `text-[13px] text-text-secondary`; baris "Pekerjaan lain" N catatan
- **Catatan:** Card & Row server-safe; LogTaskButton client (`placement="home"` secondary `lg fullWidth`, `"header"` primary `max-sm:w-full`; `disabled` bila belum absen masuk). Label/format di `lib/taskLogLabels.ts` (`formatQuantity`, `targetLabel`, `dailyProgress`, `longDate`, `myTasksHref`, `myTaskPhotoHref`, `normalizeQuantityInput`)

### TaskLogFormDialog / TaskPhotoRow
- **Path:** apps/web/components/tasks/TaskLogFormDialog.tsx, TaskPhotoRow.tsx
- **Dipakai di:** LogTaskButton (catat), TaskLogActions (ubah)
- **Referensi desain:** tanpa referensi — pola LeaveRequestFormDialog (feature 19, izin user)
- **Pola kelas kunci:** SelectField "Yang dikerjakan" (indikator template + "Pekerjaan lain (di luar indikator)"), TextField realisasi `inputMode` numeric/decimal + hint target, TextAreaField catatan/deskripsi, foto = FileDropzone → TaskPhotoRow (`rounded-field border-border-control bg-control`, pratinjau `size-12 rounded-inner object-cover` + nama + ukuran + X 44px)
- **Catatan:** client. Validasi `taskLogInputSchema` + cek bulat untuk count; koma desimal dinormalisasi. Foto diperkecil `lib/imageResize.ts` ("Menyiapkan foto…"). Mode ubah: prop `log` → foto tersimpan bisa dihapus (`removePhoto`) atau diganti. Server Action `submitTaskLog` / `updateTaskLog` (`actions/taskLogs.ts`)

### TaskDayStrip / TaskLogList / TaskLogActions
- **Path:** apps/web/components/tasks/TaskDayStrip.tsx, TaskLogList.tsx, TaskLogActions.tsx
- **Dipakai di:** /me/tasks
- **Referensi desain:** tanpa referensi — pola AttendanceMonthNav + MyLeaveRequestList (feature 19, izin user)
- **Pola kelas kunci:** strip `surface-solid grid grid-cols-8 gap-1 rounded-[20px] p-1.5`, chip Link `min-h-14 rounded-[14px]` hari `text-xs` + tanggal `font-display text-[17px] font-extrabold`, terpilih `bg-accent-soft text-accent-strong`, tanpa absen `text-text-muted`; daftar `surface-solid rounded-card px-4.5 pt-4.5` baris = jam `w-11 font-display text-[15px] font-extrabold` + judul + realisasi + catatan + foto `size-20 rounded-inner` (tautan tab baru) + Badge status; aksi teks "Ubah" `text-accent-strong` / "Hapus" `text-danger-text` → Dialog konfirmasi Button `dark`
- **Catatan:** Strip & List server-safe, Actions client (`deleteTaskLog` + `router.refresh()`). Tanggal di URL `?date=YYYY-MM-DD` (hari ini tanpa param). Foto lewat Route Handler `/me/tasks/[id]/photo?v=<updatedAt>`

### TaskVerificationList / TaskVerificationRow / TaskDecisionActions / TaskVerificationFilter
- **Path:** apps/web/components/tasks/TaskVerificationList.tsx, TaskVerificationRow.tsx, TaskDecisionActions.tsx, TaskVerificationFilter.tsx
- **Dipakai di:** /kpi/verification
- **Referensi desain:** tanpa referensi — pola LeaveRequestTable/LeaveDecisionActions + TaskLogList + action bar EmployeeForm (feature 20, izin user)
- **Pola kelas kunci:** kelompok per karyawan + tanggal = card `glass-data rounded-card`, kepala `px-4.5 pt-4 pb-3.5 lg:px-6` (checkbox grup + EmployeeAvatar `md` + nama `text-[15px] font-bold` + "Jabatan · tanggal panjang" `text-small` + "N menunggu" `text-caption`); baris `border-t border-border-subtle px-4.5 py-3.5 lg:px-6` = checkbox (label `size-11`) + jam `w-11 font-display text-[15px] font-extrabold` + judul `text-[14.5px] font-bold` + realisasi `font-display text-[15px] font-extrabold` (koreksi: `<s>` `text-text-tertiary` → angka baru) + target `text-caption text-text-tertiary` + catatan + foto `size-20 rounded-inner` + keputusan `text-small` (ditolak `text-danger-text`); aksi kanan (desktop) / di bawah (mobile, grid rata): Tolak secondary · Koreksi secondary (hanya indikator) · Setujui primary; bilah bawah `glass-data sticky bottom-2.5 rounded-[26px] lg:rounded-card` checkbox "Pilih semua (n)" / "N dipilih" + Button `lg` "Setujui N"; dialog: kotak ringkasan `rounded-inner bg-fill-subtle`, TextField realisasi (koreksi), TextAreaField alasan, Button `danger` untuk tolak
- **Catatan:** List client (state pilihan, Server Action `approveTaskLogs` → FormAlert hasil "N disetujui, M dilewati"); Row dipakai di dalam List; Actions client (`useId`, validasi `taskDecisionSchema`, Server Action `decideTaskLog` + `router.refresh()`); Filter `?status=` via `taskVerificationHref`. Kelompok dibentuk `groupByEmployeeDay` (`lib/taskVerificationLabels.ts`) dari urutan API. Foto lewat Route Handler `/kpi/verification/[id]/photo`. Checkbox hanya di filter Menunggu

### Checkbox
- **Path:** apps/web/components/common/Checkbox.tsx
- **Dipakai di:** KpiPositionPicker, TaskVerificationList/Row
- **Referensi desain:** tanpa referensi — checkbox native (feature 18/20)
- **Pola kelas kunci:** `size-4.5 shrink-0 accent-accent`; pemanggil membungkus dengan `<label>` area sentuh ≥ 44px
- **Catatan:** server-safe; props input tanpa `type`/`className`

### KpiIndicatorBreakdown / KpiScoreList / KpiPredicateDistribution / KpiScoreTeamSelect
- **Path:** apps/web/components/kpi/KpiIndicatorBreakdown.tsx, KpiScoreList.tsx, KpiPredicateDistribution.tsx, KpiScoreTeamSelect.tsx
- **Dipakai di:** /kpi/scores (Breakdown juga di /me/performance)
- **Referensi desain:** tanpa snapshot halaman — pola AttendanceRecapTable + card "Sebaran predikat KPI" `context/designs/dashboard.html` (feature 21, izin user)
- **Pola kelas kunci:** Breakdown = `<ul>` baris `border-t border-border-subtle py-3.5` (nama `text-[14.5px] font-bold` + target·bobot `text-caption text-text-tertiary`; kanan capaian `font-display text-[17px] font-extrabold` + poin caption, atau Badge neutral "Belum dinilai"/"Tidak dihitung"), bar `h-2 bg-chart-track` isi `bg-accent` (≥100% `bg-success`, lebar = capaian ÷ 120), lalu rumus skor `text-[13px]` + hari target caption. List = `glass-data rounded-card`, baris `<details>` grid (desktop kolom Karyawan · Template · Skor `text-[22px] font-extrabold` · Predikat Badge · chevron), isi `rounded-inner bg-fill-subtle`; tanpa template = baris tidak bisa dibuka. Distribution = `glass-strong rounded-card` 4 baris label+rentang, angka `text-lg font-extrabold`, bar `h-2.5` warna predikat (lebar relatif predikat terbanyak). TeamSelect = `glass rounded-card p-2 lg:w-72` + SelectField labelHidden
- **Catatan:** semua server-safe kecuali TeamSelect (client, `?team=` via `kpiScoresHref`). Label/tone di `lib/kpiScoreLabels.ts` (`PREDICATE_TONES` success/accent/warning/danger, `PREDICATE_BAR_CLASSES`, `PREDICATE_TEXT_CLASSES`, `indicatorTargetLabel`, `indicatorActualLabel`). Di halaman: 2 StatTile (Rata-rata skor + badge predikat, Karyawan dengan skor; `col-span-2` di mobile) kiri, Distribution kanan (`lg:grid-cols-[1fr_1.85fr]`)

### KpiMyScoreCard / KpiScoreTile
- **Path:** apps/web/components/kpi/KpiMyScoreCard.tsx, KpiScoreTile.tsx
- **Dipakai di:** /me/performance (Card), /me (Tile)
- **Referensi desain:** tile "Skor bulan ini" `context/designs/me.html`; Card diturunkan darinya (feature 21)
- **Pola kelas kunci:** Tile = Link `surface-solid rounded-[20px] p-4` (label `text-[13px]`, angka `font-display text-[30px] font-extrabold` + predikat teks berwarna `text-[13px] font-bold`, periode `text-[12.5px] text-text-tertiary`, tanpa chevron — satu sel grid tile beranda sejak feature 37); Card = `surface-solid rounded-[22px] p-4.5`, angka `text-[44px] font-extrabold` + Badge predikat
- **Catatan:** server component. Tile hanya tampil jika akun tertaut & jabatan punya template. Rincian di /me/performance = KpiIndicatorBreakdown di card `surface-solid rounded-[22px]`; navigasi bulan = AttendanceMonthNav `basePath="/me/performance"`

### KpiCycleForm
- **Path:** apps/web/components/kpi/KpiCycleForm.tsx
- **Dipakai di:** /settings/kpi (di dalam FormSection "Siklus penilaian")
- **Referensi desain:** tanpa referensi — pola WorkScheduleForm + SegmentedControl design-tokens.html (feature 22, izin user)
- **Pola kelas kunci:** SegmentedControl `fullWidth size="lg"` + deskripsi `text-small text-text-secondary`; FormAlert info saat pilihan berubah; bilah bawah `border-t border-border-subtle pt-5` (periode berjalan `text-caption` kiri, tombol "Simpan siklus" kanan, nonaktif jika tidak berubah)
- **Catatan:** client; label/deskripsi siklus di `lib/kpiReviewLabels.ts` (`CYCLE_DESCRIPTIONS`, `reviewPeriodLabel`, `reviewPeriodRange`)

### CreateKpiReviewsButton / MissingReviewsBanner / KpiReviewPeriodSelect / KpiReviewList
- **Path:** apps/web/components/kpi/CreateKpiReviewsButton.tsx, MissingReviewsBanner.tsx, KpiReviewPeriodSelect.tsx, KpiReviewList.tsx
- **Dipakai di:** /kpi/reviews
- **Referensi desain:** tanpa referensi — pola /kpi/scores (KpiScoreTeamSelect, KpiScoreList) + InviteUserDialog + Banner (feature 22, izin user)
- **Pola kelas kunci:** Create = Button primary + Plus → Dialog berisi SelectField periode (kandidat dari API); PeriodSelect = `glass rounded-card p-2 lg:w-96` + SelectField labelHidden (`?period=`); MissingBanner = Banner warning (danger saat gagal) + tombol secondary "Tambahkan"; List = `glass-data rounded-card`, baris `<Link>` grid desktop Karyawan · Template · Status Badge · Skor `text-[22px] font-extrabold` · Predikat · ChevronRight, mobile status + predikat di baris kedua
- **Catatan:** List server component, sisanya client. Status tone `REVIEW_STATUS_TONES` (Draf neutral, Direview warning, Final info). Di halaman: 3 StatTile (Draf, Direview, Final n/total) `grid-cols-3`

### KpiReviewRatingForm / KpiReviewStatusActions / KpiReviewsBackLink
- **Path:** apps/web/components/kpi/KpiReviewRatingForm.tsx, KpiReviewStatusActions.tsx, KpiReviewsBackLink.tsx
- **Dipakai di:** /kpi/reviews/[id]
- **Referensi desain:** tanpa referensi — SegmentedControl + action bar form + pola TaskDecisionActions (feature 22, izin user)
- **Pola kelas kunci:** RatingForm = card `glass-strong rounded-card p-5 lg:p-6`, per indikator SegmentedControl 1–5 `fullWidth size="lg"` + keterangan skala caption, tombol "Simpan nilai" (secondary) + "Kirim untuk difinalkan" (primary); StatusActions = "Kembalikan ke draf" (secondary) + "Finalkan" (primary) → Dialog konfirmasi (FormAlert warning jika ada catatan tugas belum diverifikasi); BackLink = pola KpiTemplatesBackLink ke `/kpi/reviews?period=`
- **Catatan:** client (kecuali BackLink). Layout detail: kiri StatTile skor (sementara/final + badge predikat) + RatingForm/Finalisasi, kanan card "Rincian skor" berisi KpiIndicatorBreakdown (`lg:grid-cols-[1fr_1.85fr]`); Banner untuk final (Lock), direview, tanpa template, catatan tugas menunggu verifikasi

### KpiReviewSummaryPanel
- **Path:** apps/web/components/kpi/KpiReviewSummaryPanel.tsx
- **Dipakai di:** /kpi/reviews/[id] (kolom kanan, di bawah "Rincian skor")
- **Referensi desain:** tanpa referensi — pola card detail penilaian + TextAreaField + Dialog (feature 23, izin user)
- **Pola kelas kunci:** card `glass-strong rounded-card p-5 lg:p-6`; header h2 "Ringkasan kinerja" + Badge status kanan (info Sedang dibuat / warning Menunggu ditinjau / success Sudah ditinjau / danger Gagal dibuat); narasi `text-body whitespace-pre-line` + caption asal & peninjau; saat AI menulis skeleton `animate-exa-pulse` 3 bar; action bar `border-t pt-5`: Ubah/Tulis sendiri (secondary), Buat (ulang) dengan AI (primary jika kosong), Tandai sudah ditinjau (primary) + caption kuota rata kanan
- **Catatan:** client; polling `router.refresh()` tiap 3 dtk selama `generation.pending`; mode edit = TextAreaField 10 baris + hitungan karakter (maks. 4000), simpan = sekaligus ditinjau; buat ulang saat sudah ada narasi → Dialog konfirmasi (memakai satu kuota). Kuota habis → tombol AI nonaktif + caption tanggal reset. Panel Finalisasi menyesuaikan teks jika narasi belum ditinjau / sedang dibuat


### SalaryComponentList / SalaryComponentActions / SalaryComponentFormDialog / AddSalaryComponentButton
- **Path:** apps/web/components/payroll/SalaryComponentList.tsx, SalaryComponentActions.tsx, SalaryComponentFormDialog.tsx, AddSalaryComponentButton.tsx
- **Dipakai di:** /settings/salary-components
- **Referensi desain:** tanpa referensi — pola OrgListCard + OrgItemActions + OrgItemFormDialog (feature 28, izin user; tercatat di progress-tracker)
- **Pola kelas kunci:** card `glass-strong rounded-card` (tanpa overflow-hidden); header `px-5 pt-5 pb-3 lg:px-6` judul `text-h2` + jumlah aktif `text-text-tertiary tabular-nums` + Button secondary "Tambah"; baris `min-h-15 border-t border-border-subtle px-5 py-2.5 lg:px-6` nama `text-[15px] font-bold` (+ Badge `outline` "Diarsipkan", nama `text-text-secondary`) + sub `text-small` "Jenis · Dipakai N karyawan / Hanya di riwayat gaji / Belum dipakai"; menu ⋯ Ubah / Arsipkan|Pulihkan / Hapus `text-danger-text`
- **Catatan:** List server-safe (props `components`), daftar tidak pernah kosong (gaji pokok wajib). Dialog: TextField nama + SelectField jenis dengan `hint` penjelasan perlakuan jenis (`COMPONENT_KIND_DESCRIPTIONS`); jenis terkunci untuk gaji pokok & komponen terpakai; opsi gaji pokok tidak ditawarkan. Gaji pokok: hanya Ubah; Hapus disembunyikan jika `inUse`. Konfirmasi arsip/pulihkan/hapus = Dialog (Button `dark`, pulihkan `primary`). Label & helper di `lib/salaryLabels.ts`; Server Action `actions/salary.ts`

### JkkRiskLevelForm
- **Path:** apps/web/components/payroll/JkkRiskLevelForm.tsx
- **Dipakai di:** /settings/salary-components (FormSection "BPJS Ketenagakerjaan")
- **Referensi desain:** tanpa referensi — pola form pengaturan FormSection (feature 28)
- **Pola kelas kunci:** SelectField + hint; footer `border-t pt-5` Button primary "Simpan" (nonaktif jika tidak berubah); FormAlert hasil
- **Catatan:** client. Label kelompok di `JKK_RISK_LABELS` (tarif tidak ditulis di web — dari data regulasi). Server Action `saveJkkRiskLevel`

### EmployeeSalaryTab / EmployeeSalaryForm / EmployeeSalaryVersionList
- **Path:** apps/web/components/payroll/EmployeeSalaryTab.tsx, EmployeeSalaryForm.tsx, EmployeeSalaryVersionList.tsx
- **Dipakai di:** /employees/[id] tab Gaji (owner/admin saja — tab disembunyikan untuk atasan)
- **Referensi desain:** tanpa referensi — pola FormSection + EmployeeForm (action bar) + DeductionRuleVersionList (feature 28, izin user)
- **Pola kelas kunci:** "Gaji saat ini" = FormSection + `aside` Button secondary "Ubah gaji"; baris komponen `border-t py-3` nama `text-[14.5px] font-bold` + jenis `text-caption` + nominal `font-display text-[17px] font-bold tabular-nums` (potongan diawali "−"); total `dl rounded-inner bg-fill-subtle sm:grid-cols-2` angka `font-display text-xl font-extrabold`; ringkasan BPJS/risiko JKK/catatan `dl sm:grid-cols-[120px_minmax(0,1fr)] text-small`. Form = 3 FormSection (Komponen gaji: MoneyField per komponen `grid sm:grid-cols-2` dengan hint jenis; Kepesertaan BPJS: daftar Checkbox ala KpiPositionPicker; Tanggal berlaku: TextField date + FormAlert warning versi tergantikan + TextAreaField catatan) + action bar `glass-data sticky … lg:static` (Batal / Simpan gaji). Belum ada gaji = EmptyState ikon Wallet + CTA "Atur gaji"
- **Catatan:** Tab client (state `editing`), data dari page (`fetchEmployeeSalary` paralel dengan opsi form). Form diisi dari versi saat ini (`currentSalaryVersion`: berlaku hari ini, selain itu terjadwal terdekat); gaji pertama default semua program BPJS + tanggal awal bulan berjalan (atau tanggal masuk). Komponen kosong = tidak ikut; komponen diarsipkan di versi lama → FormAlert. Total dari API (web tidak menjumlah uang). VersionList server-safe, status memakai `VERSION_STATUS_LABELS/TONES` aturan potongan

### OpenPayrollRunButton / PayrollRunList / PayrollBackLink
- **Path:** apps/web/components/payroll/OpenPayrollRunButton.tsx, PayrollRunList.tsx, PayrollBackLink.tsx
- **Dipakai di:** /payroll (BackLink juga /payroll/[id] & rincian karyawan)
- **Referensi desain:** tanpa referensi — pola CreateKpiReviewsButton + KpiReviewList + KpiReviewsBackLink (feature 29, izin user)
- **Pola kelas kunci:** Open = Button primary + Plus → Dialog SelectField bulan (dari `openableMonths` API); List = `glass-data rounded-card`, baris `<Link>` grid judul "Gaji Oktober 2026" `text-[15px] font-bold` + caption rentang · gajian · N penyesuaian, Badge status (Draf neutral, Final info), ChevronRight
- **Catatan:** Open client, sisanya server. Label & href di `lib/payrollRunLabels.ts` (`runTitle`, `runPeriodSummary`, `runHref`, `employeeHref`, `rupiahNumber` untuk StatTile berlabel "(Rp)", `minusRupiah`)

### PayrollRunEmployeeTable
- **Path:** apps/web/components/payroll/PayrollRunEmployeeTable.tsx
- **Dipakai di:** /payroll/[id]
- **Referensi desain:** tanpa referensi — pola AttendanceRecapTable/KpiReviewList (feature 29, izin user)
- **Pola kelas kunci:** `glass-data rounded-card`, thead `bg-table-head h-11` desktop kolom Karyawan · Pendapatan bruto · Potongan · PPh 21 · Gaji diterima (`font-display text-[15px]/[17px] font-bold tabular-nums` rata kanan) · chevron; mobile nama + gaji diterima; baris kedua Badge status (non-dihitung) + Badge info "Masuk {tgl}" / outline "Keluar {tgl}" (tanggal di dalam rentang periode, feature 30b; props `periodStart`/`periodEnd`) + Badge warning "N catatan"
- **Catatan:** server. Di halaman: Banner warning (peringatan periode, list) + Banner danger (karyawan belum bisa dihitung) + 4 StatTile `grid-cols-2 xl:grid-cols-4` (Pendapatan bruto, BPJS perusahaan, PPh 21, Gaji diterima — angka tanpa "Rp", satuan di label)

### PayrollFinalizeAction
- **Path:** apps/web/components/payroll/PayrollFinalizeAction.tsx
- **Dipakai di:** /payroll/[id] (PageHeader actions, di samping Badge status — hanya periode draf)
- **Referensi desain:** tanpa referensi — pola KpiReviewStatusActions (Button + Dialog konfirmasi) (feature 30, izin user)
- **Pola kelas kunci:** Button primary "Finalisasi" (`disabled` bila ada syarat belum terpenuhi); Dialog judul "Finalisasi payroll?" + deskripsi judul periode, isi `text-body` (jumlah karyawan & total diterima `font-bold tabular-nums`) + `text-small text-text-secondary` (dampak), FormAlert danger untuk error
- **Catatan:** client; kirim `fingerprint` draf ke Server Action `finalizePayrollRun` (409 bila draf berubah). Di halaman: Banner neutral ikon `Lock` "Belum bisa difinalisasi" (list syarat dari API) untuk draf, "Payroll final — angka dikunci" (waktu + nama) untuk final; footer tabel menyebut sumber angka (snapshot vs draf)

### PayrollBreakdown / PayrollStepList
- **Path:** apps/web/components/payroll/PayrollBreakdown.tsx, PayrollStepList.tsx
- **Dipakai di:** /payroll/[id]/employees/[employeeId]
- **Referensi desain:** tanpa referensi — pola DeductionPreviewResult + EmployeeSalaryTab (feature 29, izin user)
- **Pola kelas kunci:** card `glass-strong rounded-card p-5 lg:p-6`; grup berpemisah `border-t pt-5` (Pendapatan · Potongan absensi · Iuran BPJS · Potongan · PPh 21) judul `text-[15px] font-bold` + catatan `text-small`; baris label bold + caption + nominal `font-display text-[16px] font-bold` (potongan "−"); subtotal `rounded-inner bg-fill-subtle` angka `text-lg font-extrabold`; akhir "Gaji diterima" `bg-accent-soft` `text-2xl font-extrabold`. StepList = `<details>` "Lihat perhitungan" `text-small font-bold text-accent-strong`, isi `rounded-inner bg-fill-subtle`
- **Catatan:** server-safe; semua angka & langkah dari API (payroll-engine). Caption komponen: "diubah dari Rp X" (override), "tambahan periode ini" (add_line). Baris tunjangan kehadiran disembunyikan bila karyawan tidak punya tunjangan itu

### PayrollAdjustmentPanel / PayrollLineDialog / PayrollOverrideDialog / PayrollReasonDialog
- **Path:** apps/web/components/payroll/PayrollAdjustmentPanel.tsx, PayrollLineDialog.tsx, PayrollOverrideDialog.tsx, PayrollReasonDialog.tsx
- **Dipakai di:** /payroll/[id]/employees/[employeeId] (kolom kiri di bawah StatTile "Gaji diterima")
- **Referensi desain:** tanpa referensi — card glass-strong + daftar berpemisah + Dialog (pola SalaryComponentFormDialog) (feature 29, izin user)
- **Pola kelas kunci:** daftar penyesuaian (judul bold + nilai + alasan `text-small` + pembuat·waktu caption + tautan teks "Ubah" accent / "Hapus|Terapkan lagi|Ikutkan kembali" `text-danger-text`); tombol secondary `flex-col sm:flex-row sm:flex-wrap`: Pendapatan / potongan, Ubah nominal, Batalkan potongan absensi, Keluarkan
- **Catatan:** client. Dialog: Line (SelectField jenis + TextField keterangan + MoneyField), Override (SelectField komponen versi gaji — terkunci saat ubah, MoneyField boleh 0, TextAreaField alasan), Reason (waive/exclude, tombol `dark`). Server Action `actions/payrollRuns.ts`; `editable=false` saat periode final (feature 30)


### PayslipTable / PayslipRunActions / ResendPayslipEmailButton / PayslipAutoRefresh
- **Path:** apps/web/components/payroll/PayslipTable.tsx, PayslipRunActions.tsx, ResendPayslipEmailButton.tsx, PayslipAutoRefresh.tsx
- **Dipakai di:** /payroll/[id]/slips (tautan tombol primary "Slip gaji" ikon `FileText` di PageHeader /payroll/[id] bila final)
- **Referensi desain:** tanpa referensi — pola PayrollRunEmployeeTable + PayrollFinalizeAction (feature 31, izin user)
- **Pola kelas kunci:** `glass-data rounded-card`, thead `bg-table-head h-11` desktop kolom Karyawan · Gaji diterima · Status · Aksi; baris avatar + nama + caption (no. karyawan · keterangan email, `text-danger-text` bila gagal); Badge status (Menunggu/Sedang dibuat neutral, Gagal danger, "Siap · belum terbit" warning, "Terbit <tgl pendek>" success, email antre/gagal); aksi tautan teks accent "Buka PDF" (ikon FileText, tab baru) + "Kirim ulang email" (`min-h-11`); mobile badge & aksi turun `pl-12`
- **Catatan:** Table & halaman server; Actions/Resend/AutoRefresh client. PayslipRunActions: Button secondary "Proses ulang" (ada slip gagal/menunggu) + primary "Terbitkan N slip" → Dialog konfirmasi (jumlah slip, karyawan yang dikirimi email, tanpa akun portal); disembunyikan bila semua slip sudah terbit. AutoRefresh `router.refresh()` tiap 3 dtk selama ada slip pending/generating atau email antre. Halaman: Banner danger (gagal) / neutral ikon Info (sedang dibuat) + 4 StatTile (Slip siap x/y, Sudah terbit, Email terkirim, Tanpa akun portal). Label & href di `lib/payslipLabels.ts`; Server Action `actions/payslips.ts`; PDF lewat Route Handler `/payroll/[id]/slips/[payslipId]/pdf` (gagal → `?pdf=error`).

### MyPayslipList / MaskedAmount
- **Path:** apps/web/components/payroll/MyPayslipList.tsx, MaskedAmount.tsx
- **Dipakai di:** /me/payslips
- **Referensi desain:** kartu "Slip gaji terakhir" snapshot me.html (nominal tersamar + Lihat/Sembunyikan) + pola MyLeaveRequestList (feature 31, izin user)
- **Pola kelas kunci:** satu card `surface-solid rounded-card px-4.5 py-4` per bulan: judul `font-display text-[17px] font-bold` "Gaji <bulan>" + `runPeriodSummary` `text-small tabular-nums`; pemisah `border-t`; label "Gaji diterima" `text-[13px]` + MaskedAmount (`font-display text-[19px] font-extrabold`, tersamar "Rp ••••••••" `tracking-[0.08em]`, tombol `aria-pressed` Eye/EyeOff accent-strong `min-h-11`); tautan `buttonClassName({ variant: "secondary", size: "lg", fullWidth: true })` "Unduh slip PDF" ikon Download
- **Catatan:** List server, MaskedAmount client. Kosong = EmptyState `surface="solid"` ikon Receipt; belum tertaut = FormAlert info. PDF lewat Route Handler `/me/payslips/[id]/pdf` (hanya slip terbit milik sendiri).

### PayrollReportTable / PayrollReportYearNav
- **Path:** apps/web/components/payroll/PayrollReportTable.tsx, PayrollReportYearNav.tsx
- **Dipakai di:** /payroll/reports
- **Referensi desain:** tanpa referensi — pola PayrollRunEmployeeTable + /payroll/[id] (StatTile) (feature 32, izin user)
- **Pola kelas kunci:** Table `glass-data rounded-card`, thead `bg-table-head h-11` desktop kolom Periode · Pendapatan bruto · BPJS perusahaan · BPJS karyawan · PPh 21 · Gaji diterima · Ekspor Excel (uang `font-display text-[15px] font-bold tabular-nums` rata kanan); judul periode tautan ke /payroll/[id] + caption "N slip · runPeriodSummary"; tautan unduh teks accent ikon Download ("Transfer bank", "Rekap setor") — desktop bertumpuk kanan, mobile sebaris di bawah; baris total `bg-table-head` "Total <tahun>". YearNav: pill tautan `h-10 rounded-full` per tahun, aktif `bg-inverse text-on-inverse`, lainnya gaya Button secondary.
- **Catatan:** server. Halaman: PageHeader + FormAlert danger bila `?export=error` + YearNav + 4 StatTile (bruto, BPJS perusahaan, PPh 21, gaji diterima) + EmptyState ikon FileSpreadsheet bila tahun tanpa periode final + catatan `text-small`. Unduhan lewat Route Handler `/payroll/reports/[runId]/transfer|contributions` (`reportFileResponse` di `lib/api/payrollReports.ts`, `?year=` untuk kembali saat gagal).

### ComplianceReminderList / ComplianceReminderAction / ComplianceMonthNav
- **Path:** apps/web/components/compliance/ComplianceReminderList.tsx, ComplianceReminderAction.tsx, ComplianceMonthNav.tsx
- **Dipakai di:** /compliance
- **Referensi desain:** tanpa referensi halaman — baris kartu "Pengingat kepatuhan" dashboard.html + pola StatTile/OrgListCard/AttendancePeriodNav (feature 33, izin user)
- **Pola kelas kunci:** card `glass-strong rounded-card` header `px-5 pt-5 pb-3 lg:px-6` judul `font-display text-h2 font-bold` + jumlah `text-text-tertiary`; baris `min-h-16 border-t border-border-subtle px-5 py-3` = CalendarDate + judul `text-[14.5px] font-bold` + sub `text-small` (masa / nama karyawan tautan ke /employees/[id], "· ditandai <nama>") + Badge tenggat (`complianceDueBadge`: success Selesai · danger Terlewat n hari/Hari ini · warning Besok/H-≤7 · neutral H-n) + tautan teks aksi (accent "Tandai selesai" / secondary "Batalkan"); selesai = tanggal & judul diredupkan. MonthNav: panel `glass rounded-card p-2` panah `size-11` + label `font-display text-[17px] font-bold`, tautan "Bulan ini" (sm+) bila bukan bulan berjalan; bulan depan boleh dibuka
- **Catatan:** List & MonthNav server, Action client (Server Action `completeComplianceReminder`/`reopenComplianceReminder` + `router.refresh()`, error kecil di bawah). Halaman: PageHeader + 4 StatTile (Terlewat + badge danger "Perlu tindakan", 7 hari ke depan, Belum selesai, Selesai) + card "Terlewat" (bila ada) + MonthNav + card bulan / EmptyState success CalendarCheck + catatan sumber aturan. Label di `lib/complianceLabels.ts`, judul jenis dari `COMPLIANCE_REMINDER_KIND_LABELS` (`@exapay/shared`). URL `?month=YYYY-MM`

### MinimumWageBanner
- **Path:** apps/web/components/compliance/MinimumWageBanner.tsx
- **Dipakai di:** /compliance (di bawah PageHeader, di atas StatTile)
- **Referensi desain:** context/designs/dashboard.html (banner "N karyawan bergaji pokok di bawah UMK …") lewat Banner (design-tokens "banner")
- **Pola kelas kunci:** Banner warning per status (`below` / `below_upcoming`), description = teks + `ul mt-1.5 flex-col gap-1` nama tautan `font-bold text-accent-strong` + "— upah Rp …" `tabular-nums`; Banner neutral ikon MapPin bila lokasi usaha belum diatur (aksi Button secondary "Atur lokasi usaha" → /settings/company) atau data upah minimum belum ada
- **Catatan:** server component, prop `summary: MinimumWageSummary`. Tidak merender apa pun bila tidak ada karyawan tertandai. Label lewat `minimumWageLabel` (@exapay/shared) + `minimumWageReferenceOf` (lib/employeeLabels.ts). Dipakai ulang di /dashboard (feature 35)

### AttendanceChartCard / PendingActionsCard
- **Path:** apps/web/components/dashboard/AttendanceChartCard.tsx, PendingActionsCard.tsx
- **Dipakai di:** /dashboard (owner/admin & atasan — feature 36)
- **Referensi desain:** context/designs/dashboard.html (card "Rekap kehadiran 30 hari", "Tindakan tertunda", state empty tindakan tertunda, mobile 390)
- **Pola kelas kunci:** Chart: `glass-strong rounded-card px-5 py-5 sm:px-6 gap-4.5`; panel detail `rounded-field bg-fill-subtle px-3.5 py-2.5 text-small` (tanggal `min-w-36 font-bold`, angka `<b>`); area batang `h-40.5 border-b border-border-control gap-0.5 sm:gap-1.5`, batang = `<button>` flex-1 `flex-col-reverse` segmen `bg-chart-present|late|leave|absent` tinggi % terhadap karyawan terjadwal terbanyak, non-aktif `opacity-55`; label sumbu `text-xs text-text-tertiary` (tgl pertama, tiap 7 hari, terakhir); legenda kotak `size-2.5 rounded-[3px]` + label · total. Pending: header judul `text-h2` + pill jumlah `bg-inverse text-on-inverse h-5.5 rounded-full text-xs`; baris `border-t border-border-subtle py-3 sm:py-4` judul `text-sm sm:text-[15px] font-bold` + sub; tautan `buttonClassName` (primary untuk payroll, secondary lainnya) `max-sm:hidden` + chevron `size-11 sm:hidden`; kosong = ikon CircleCheck success + judul + teks
- **Catatan:** Chart client (`useState` tanggal aktif, default hari ini; hover/focus/klik), prop `recap: AttendanceDailyRecap`; legenda "Tepat waktu" = hadir − telat (total halaman /attendance: hadir termasuk telat). PendingActionsCard server, prop `items: PendingAction[]` (`key,title,description,action,href,primary?`) — teks disusun di page. Halaman /dashboard juga memakai StatTile (prefix/suffix), KpiPredicateDistribution (prop baru `title?`, `action?` tautan "Lihat skor"), ComplianceReminderList (prop baru `actions={false}` = hanya baca), MinimumWageBanner; kartu pengingat inline di page (header + Badge danger "n terlewat" + tautan "Buka kalender", kosong = EmptyState `surface="none"`). Mobile: daftar (pending + pengingat) sebelum grafik (`max-xl:order-first`); tile 1 & 4 `max-xl:col-span-2`. Skeleton `app/(main)/dashboard/loading.tsx`. Atasan: placeholder sampai feature 36

### SupervisorDashboardView (dashboard atasan)
- **Path:** apps/web/app/(main)/dashboard/page.tsx (fungsi `SupervisorDashboardView`, `supervisorPendingActions`)
- **Dipakai di:** /dashboard (peran atasan)
- **Referensi desain:** tanpa snapshot khusus — turunan context/designs/dashboard.html (feature 36, izin user)
- **Kelas/komponen:** PageHeader (sapaan + "Periode … · N bawahan aktif · N hal menunggu"), grid `grid-cols-2 gap-3 lg:gap-4 xl:grid-cols-4` StatTile (Bawahan aktif & Rata-rata KPI tim `max-xl:col-span-2`), PendingActionsCard (`emptyDescription` versi atasan) di atas, lalu grid `xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]` AttendanceChartCard + KpiPredicateDistribution. EmptyState `UserRoundX` bila akun belum tertaut data karyawan; `CloudOff` bila gagal muat.

### AttendanceMonthTile / LatestPayslipTile (grid tile beranda /me)
- **Path:** apps/web/components/attendance/AttendanceMonthTile.tsx, apps/web/components/payroll/LatestPayslipTile.tsx
- **Dipakai di:** /me (grid `grid-cols-2 gap-2.5` bersama KpiScoreTile, di bawah kartu Tugas hari ini)
- **Referensi desain:** context/designs/me.html (tile "Kehadiran bulan ini", "Slip gaji terakhir · <bulan>")
- **Pola kelas kunci:** AttendanceMonthTile = Link `surface-solid rounded-[20px] p-4 gap-1.5` ke /me/attendance, angka `font-display text-[30px] font-extrabold` + "hadir" `text-[13px] font-bold`, catatan "n telat · n alpa" `text-[12.5px] text-text-tertiary`; prop `wide` → `col-span-2` (tile skor tidak tampil). LatestPayslipTile = `surface-solid col-span-2 rounded-[20px] px-4 py-3` label `text-[13px] text-text-secondary` + MaskedAmount (Lihat/Sembunyikan)
- **Catatan:** server component. Tile yang datanya gagal dimuat / tidak relevan dilewati (slip hanya bila ada slip terbit; kehadiran bila akun tertaut)

### MyProfileView / ChangePasswordButton / ReadFields
- **Path:** apps/web/components/employees/MyProfileView.tsx, apps/web/components/auth/ChangePasswordButton.tsx, apps/web/components/common/ReadFields.tsx
- **Dipakai di:** /me/profile (ReadFields juga di EmployeeDataSections /employees/[id])
- **Referensi desain:** tanpa referensi — pola me.html (card solid) + section baca detail karyawan (feature 37, izin user)
- **Pola kelas kunci:** card identitas `surface-solid rounded-card p-4.5` = EmployeeAvatar `lg` + nama `font-display text-[19px] font-extrabold` + "jabatan · departemen" `text-sm text-text-secondary` + Badge status kerja (Nonaktif = neutral) + "No. induk …" `text-[13px] text-text-tertiary`; section `surface-solid rounded-card p-4.5 gap-4` judul `font-display text-[17px] font-bold` (+ catatan gembok `text-[13px]` untuk Pajak & rekening) berisi ReadFields (`dl grid gap-x-6 gap-y-5.5 sm:grid-cols-2`, dt `text-[13px] text-text-tertiary`, dd `text-[15px] font-medium`, tersamar `tracking-[0.04em]`); section Akun = ReadFields (email masuk, usaha, peran) + Button secondary lg fullWidth "Ganti password" (ikon KeyRound) + tombol Keluar secondary `text-danger-text` (`<form action={logout}>`)
- **Catatan:** MyProfileView server; ChangePasswordButton client — Dialog 3 PasswordField (saat ini, baru, konfirmasi) validasi `changePasswordSchema`, Server Action `changePassword`, sukses = isi dialog berganti "Password berhasil diubah" + tombol Selesai. Tanpa reveal data sensitif. Akun belum tertaut / nonaktif = FormAlert info

### MyKpiReviewList
- **Path:** apps/web/components/kpi/MyKpiReviewList.tsx
- **Dipakai di:** /me/performance (section "Penilaian periodik" di bawah skor bulanan)
- **Referensi desain:** tanpa referensi — pola KpiMyScoreCard + baris terlipat KpiScoreList (feature 37, izin user)
- **Pola kelas kunci:** heading section `font-display text-[19px] font-extrabold` + deskripsi `text-small`; card per periode `surface-solid rounded-card p-4.5 gap-3`: judul `reviewPeriodLabel` `text-[17px] font-bold` + siklus · rentang `text-small`, kanan skor `font-display text-[30px] font-extrabold` + Badge predikat; "Catatan kinerja" `rounded-inner bg-fill-subtle px-4 py-3` teks `text-sm whitespace-pre-line`; `<details>` "Rincian indikator" (summary `text-sm font-bold text-accent-strong` + ChevronDown berputar) berisi KpiIndicatorBreakdown; footer `text-caption text-text-tertiary` "Template … · difinalkan <tgl>"
- **Catatan:** server component, prop `reviews: MyKpiReview[]` (hanya final). Kosong = EmptyState solid ikon ClipboardCheck; gagal = EmptyState CloudOff (skor bulanan tetap tampil)

### PWA (manifest, service worker, offline)
- **Path:** apps/web/app/manifest.ts, apps/web/public/sw.js, apps/web/public/offline.html, apps/web/public/icons/*, apps/web/components/common/ServiceWorkerRegistrar.tsx
- **Dipakai di:** root layout (`ServiceWorkerRegistrar`, metadata `appleWebApp`/`icons`, `viewport.themeColor`)
- **Referensi desain:** token ui-tokens.md (background `#fbf8f3`, accent `#f2790f`, card 22px, tombol pill); ikon = logo placeholder ExapayLogo
- **Catatan:** offline.html statis mandiri dengan `<style>` sendiri (bukan component — tidak boleh bergantung CSS/JS aplikasi yang belum ter-cache). SW tidak meng-cache halaman/data

### EmployeeKpiTab / EmployeeAttendanceTab (tab detail karyawan)
- **Path:** apps/web/components/employees/EmployeeKpiTab.tsx, EmployeeAttendanceTab.tsx
- **Dipakai di:** /employees/[id]?tab=kpi · ?tab=attendance
- **Referensi desain:** tanpa referensi — pola /me/performance + baris /kpi/reviews (KPI) dan halaman Koreksi absensi (Absensi), feature 37b, izin user
- **Pola kelas kunci:** KPI: grid `xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] xl:items-start gap-4`; kiri AttendanceMonthNav (`basePath="/employees/<id>?tab=kpi"`) + card `glass-data rounded-card px-4.5 pt-4.5 pb-2.5 lg:px-6` (label `text-[13px]`, angka `font-display text-[44px] font-extrabold` + Badge predikat, caption template `text-[12.5px] text-text-tertiary`, KpiIndicatorBreakdown); kanan card `glass-data` "Penilaian periodik" — baris Link `min-h-16 px-4.5 py-3 hover:bg-row-hover lg:px-6` (periode `text-[14.5px] font-bold` + siklus · rentang `text-small`, kanan skor `font-display text-[17px] font-extrabold` + Badge predikat untuk final / Badge status untuk draf-direview, ChevronRight) ke /kpi/reviews/[id]. Absensi: AttendancePeriodNav (`keep={{ tab: "attendance" }}`) + AttendanceDayList `showEmployee={false}` (judul "Rincian harian")
- **Catatan:** server component, data `ApiResult` dari page (EmptyState CloudOff bila gagal; KPI tanpa template = EmptyState Target; tanpa penilaian = EmptyState `surface="none"`)

### MinimumWageAlertsForm
- **Path:** apps/web/components/company/MinimumWageAlertsForm.tsx
- **Dipakai di:** /settings/company (FormSection "Peringatan upah minimum" di bawah CompanyProfileForm)
- **Referensi desain:** tanpa referensi — pola JkkRiskLevelForm di FormSection (revisi 2026-10-02)
- **Pola kelas kunci:** label `flex min-h-11 items-start gap-3` = Checkbox + judul `text-[15px] font-bold` + penjelasan `text-small text-text-secondary`; FormAlert info "Hanya pemilik usaha…" bila bukan owner (checkbox disabled, tanpa tombol); tombol Simpan kanan `border-t pt-5` (nonaktif bila tidak berubah); FormAlert success/danger setelah simpan
- **Catatan:** client, Server Action `saveMinimumWageAlerts` (PUT /company/minimum-wage-alerts, khusus owner). MinimumWageBanner kini menerima `summary: null` (peringatan dimatikan) → tidak merender apa pun

