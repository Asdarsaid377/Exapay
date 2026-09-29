---
description: Buat halaman atau component UI dengan workflow referensi desain wajib
---

Kamu akan membuat UI: $ARGUMENTS

Jalankan workflow ini berurutan, jangan melompat:

1. Baca `context/ui-workflow.md` secara penuh.
2. Cek `context/designs/` — cari file referensi untuk halaman/component ini. Jika ada file image yang relevan, BACA file image tersebut dan deskripsikan singkat apa yang kamu lihat (layout, section, komponen) sebagai konfirmasi ke user.
3. Jika TIDAK ada referensi: BERHENTI dan tanyakan ke user sesuai template di ui-workflow.md. Jangan generate kode apapun sebelum user menjawab.
4. Cek `context/ui-registry.md` — daftar component yang bisa dipakai ulang untuk task ini.
5. Baca `context/ui-rules.md` dan `context/ui-tokens.md`.
6. Sampaikan rencana singkat (component apa saja yang akan dibuat/dipakai ulang, di file mana) — lalu build.
7. Build dengan mock data dulu jika data asli belum tersedia. Ikuti `context/code-standards.md`.
8. Setelah selesai: update `context/ui-registry.md` untuk setiap component baru, dan laporkan cara memverifikasi hasilnya secara visual.
