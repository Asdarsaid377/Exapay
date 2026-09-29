---
description: Perubahan schema database PostgreSQL via migration
---

Perubahan yang diminta: $ARGUMENTS

Workflow:

1. Baca `context/database-standards.md` secara penuh. Jika ORM belum diputuskan, BERHENTI dan minta keputusan dulu.
2. Baca migration terakhir di `packages/db/migrations/` untuk memahami schema saat ini.
3. Buat file migration baru memakai tool ORM terpilih — JANGAN mengedit migration lama yang sudah pernah di-apply.
4. Dalam migration yang sama sertakan untuk tabel baru: `tenant_id` + index + RLS enable + FORCE RLS + policy tenant + trigger updated_at. Kolom uang `numeric`, kolom sensitif terenkripsi.
5. Tampilkan SQL ke user dan jelaskan dampaknya SEBELUM menyarankan apply. Untuk database non-lokal, apply hanya setelah konfirmasi eksplisit user.
6. Setelah apply: regenerate type database (perintah tool ORM) dan tambahkan/ubah test isolasi tenant untuk tabel yang berubah.
7. Catat perubahan schema di `context/progress-tracker.md` bagian Notes/Decisions.

Larangan keras: reset/drop database non-lokal, DROP tanpa konfirmasi, SQL manual langsung ke production, tabel bisnis tanpa RLS.
