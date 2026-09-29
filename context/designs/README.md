# Designs — Referensi Visual

Folder ini adalah **source of truth visual**. Claude Code wajib mengecek folder ini sebelum membuat halaman atau component apapun (lihat `../ui-workflow.md`).

## Cara Menaruh Referensi

- Format: PNG atau JPG (export dari Figma, screenshot, atau referensi website)
- Penamaan: sesuai nama halaman/route — `dashboard.png`, `login.png`, `profile.png`
- Bagian spesifik: `dashboard-stats.png`, `profile-form.png`
- Breakpoint berbeda: `dashboard-mobile.png`, `dashboard-desktop.png`

## Aturan

1. Satu halaman = minimal satu file referensi sebelum halamannya dibangun
2. Jika desain berubah, ganti filenya — jangan menumpuk versi lama (arsipkan di luar repo jika perlu)
3. Setelah token warna/font diekstrak dari desain, catat di `../ui-tokens.md`
