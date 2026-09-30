---
description: Buat halaman atau component UI dengan workflow referensi desain wajib
---

Kamu akan membuat UI: $ARGUMENTS

Jalankan workflow ini berurutan, jangan melompat:

1. Baca `context/ui-workflow.md` secara penuh.
2. Cek `context/designs/` — cari referensi untuk halaman/component ini: snapshot Claude Design (`<halaman>.html`, lihat tabel di `context/designs/README.md`) atau file image. Jika ada, BACA dan deskripsikan singkat apa yang kamu lihat (layout, section, komponen) sebagai konfirmasi ke user.
3. Jika TIDAK ada referensi: BERHENTI dan tanyakan ke user sesuai template di ui-workflow.md (opsi utama: buat di Claude Design — kamu yang menyusun prompt-nya). Jangan generate kode apapun sebelum user menjawab. Jika user memilih Claude Design, ikuti "Jalur Claude Design" di ui-workflow.md sampai snapshot tersimpan & token diekstrak, baru lanjut.
4. Cek `context/ui-registry.md` — daftar component yang bisa dipakai ulang untuk task ini.
5. Baca `context/ui-rules.md` dan `context/ui-tokens.md`.
6. Sampaikan rencana singkat (component apa saja yang akan dibuat/dipakai ulang, di file mana) — lalu build.
7. Build dengan mock data dulu jika data asli belum tersedia. Ikuti `context/code-standards.md`.
8. Setelah selesai: update `context/ui-registry.md` untuk setiap component baru, dan laporkan cara memverifikasi hasilnya secara visual.
