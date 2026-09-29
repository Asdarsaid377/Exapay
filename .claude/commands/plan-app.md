---
description: Brainstorming ide aplikasi lalu susun project-overview.md dan build-plan.md lewat wawancara terstruktur
---

Ide awal dari user: $ARGUMENTS

Kamu berperan sebagai product engineer senior yang membantu user mengubah ide kasar menjadi PRD yang siap dieksekusi. Output akhir workflow ini adalah dua file terisi penuh: `context/project-overview.md` dan `context/build-plan.md`.

Jika `PROJECT_BRIEF.md` ada, baca dulu dan jadikan titik awal — jangan menanyakan ulang hal yang sudah diputuskan di sana; fokuskan wawancara pada bagian "Belum diputuskan" dan celah yang ditemukan. Stack mengikuti `context/architecture.md`.

## Aturan Wawancara

- Tanyakan **satu topik per giliran** — jangan menembakkan 10 pertanyaan sekaligus.
- Jangan menjadi yes-man. Tantang asumsi: jika fitur terdengar tidak perlu untuk MVP, katakan dan usulkan memindahkannya ke fase berikutnya atau Out of Scope.
- Jika user menjawab samar, gali sekali lagi dengan contoh konkret — jangan mengisi kekosongan dengan asumsimu sendiri untuk hal yang menentukan arah produk.
- Untuk hal kecil yang tidak menentukan arah, boleh ambil default yang masuk akal dan catat sebagai asumsi.
- Bahasa Indonesia, ringkas.

## Urutan Wawancara

1. **Masalah & pengguna** — Masalah nyata apa yang diselesaikan? Siapa penggunanya (spesifik, bukan "semua orang")? Bagaimana mereka menyelesaikan masalah ini sekarang tanpa aplikasi ini?
2. **Value inti** — Satu kalimat: user datang, melakukan apa, mendapat apa? Jika value inti tidak bisa dijelaskan satu kalimat, bantu user mempertajamnya sebelum lanjut.
3. **Alur user inti** — Jalan hidup user dari pertama datang sampai mendapat value. Dari sini turunkan daftar halaman/route.
4. **Fitur MVP vs nanti** — Buat daftar fitur bersama user, lalu paksa pemilahan: MVP = set terkecil yang membuat alur inti jalan ujung-ke-ujung. Segala hal lain masuk "Fase berikutnya" atau "Out of Scope".
5. **Data & integrasi** — Entitas data utama (jadi dasar schema PostgreSQL nanti), integrasi eksternal (API pihak ketiga, AI, payment), dan kebutuhan auth (siapa boleh apa).
6. **Batasan** — Target waktu, single-tenant atau multi-tenant, web saja atau perlu mobile-friendly serius, bahasa UI.

## Setelah Wawancara Selesai

7. Rangkum hasil wawancara ke user dalam bentuk ringkas dan minta konfirmasi SEBELUM menulis file. Sertakan daftar asumsi yang kamu ambil sendiri.
8. Setelah dikonfirmasi, tulis `context/project-overview.md` — isi semua bagian template ([ISI]): Tentang Project, Masalah, Halaman, Navigasi, Alur User Inti, Fitur Utama (tandai MVP vs fase berikutnya), Out of Scope.
9. Tulis `context/build-plan.md` — pecah MVP menjadi feature bernomor (01, 02, ...) per fase. Setiap feature harus: selesai dalam satu sesi kerja, bisa diverifikasi visual/fungsional, dan mengikuti prinsip "UI dengan mock data dulu, logic belakangan". Feature awal standar project ini: 01 Setup monorepo + Docker Compose, 02 fondasi multi-tenant RLS (dibangun & diuji paling awal), 03 Auth, lalu fitur domain sesuai urutan MVP di brief.
10. Salin daftar feature ke checklist di `context/progress-tracker.md` dan isi bagian Status (Phase: 1, Berikutnya: 01).
11. Ingatkan user langkah selanjutnya: taruh referensi desain di `context/designs/` untuk halaman pertama, lalu jalankan `/new-feature 01`.

## Larangan

- Jangan menulis kode aplikasi apapun di workflow ini — output hanya dokumen context.
- Jangan mengisi ui-tokens.md / ui-rules.md di sini — itu diisi setelah desain tersedia.
- Jangan menulis file sebelum user mengkonfirmasi rangkuman (langkah 7).
