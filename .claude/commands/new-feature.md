---
description: Kerjakan satu feature dari build-plan sampai tuntas
---

Feature yang dikerjakan: $ARGUMENTS (jika kosong, ambil item "Berikutnya" dari progress-tracker)

Workflow:

1. Baca `context/progress-tracker.md` — konfirmasi posisi build saat ini.
2. Baca definisi feature di `context/build-plan.md`. Scope feature ini adalah batas kerjamu — jangan melebar.
3. Baca file context yang relevan dengan feature ini (UI → ui-workflow dst.; database/auth/antrean → database-standards; payroll → PROJECT_BRIEF bagian 6).
4. Jika feature melibatkan UI: jalankan workflow `/build-ui` sebagai bagian dari pekerjaan (referensi desain wajib).
5. Jika feature melibatkan perubahan schema: jalankan workflow `/db-change` — jangan mengubah schema di luar migration.
6. Implement sampai feature bisa diverifikasi (visual atau fungsional). Sebutkan langkah verifikasinya secara eksplisit ke user.
7. Setelah user konfirmasi feature bekerja: update `context/progress-tracker.md` (status, last completed, next) dan `context/ui-registry.md` bila relevan.

Jangan menyentuh feature berikutnya sebelum feature ini tuntas dan tracker ter-update.
