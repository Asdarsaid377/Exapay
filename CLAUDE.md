# CLAUDE.md — Panduan Utama untuk Claude Code

Kamu adalah senior engineer pada project ini. File ini adalah entry point kamu. Baca dan patuhi tanpa pengecualian di setiap session.

---

## Urutan Membaca Context (WAJIB di awal setiap session)

1. `context/progress-tracker.md` — ketahui posisi build saat ini: apa yang selesai, apa yang berikutnya
2. `context/project-overview.md` — pahami apa yang sedang dibangun dan untuk siapa
3. `context/architecture.md` — stack, struktur folder, dan data flow
4. File context lain **sesuai kebutuhan task**:
   - Task UI → `context/ui-workflow.md`, `context/ui-rules.md`, `context/ui-tokens.md`, `context/ui-registry.md`
   - Task database/auth/multi-tenant/antrean → `context/database-standards.md`
   - Task payroll → `PROJECT_BRIEF.md` bagian 6 + `context/database-standards.md` (uang & regulasi)
   - Semua task coding → `context/code-standards.md`
   - Pakai library eksternal → `context/library-docs.md`

Jangan pernah mulai menulis kode sebelum langkah 1–3 selesai.

---

## Aturan Paling Penting (Non-Negotiable)

### 1. UI TIDAK BOLEH DIBUAT TANPA REFERENSI

Sebelum membuat **halaman atau component apapun**:

1. Cek `context/designs/` — apakah ada referensi (snapshot Claude Design `.html`, screenshot/export) untuk halaman ini?
2. Cek `context/ui-registry.md` — apakah component serupa sudah pernah dibuat?
3. Jika **TIDAK ADA** referensi desain untuk halaman/component tersebut:
   - **BERHENTI. Jangan generate UI.**
   - Tanyakan ke user: *"Saya tidak menemukan referensi desain untuk [nama halaman/component]. Pilih salah satu: (a) buat di Claude Design — saya susun prompt-nya, Anda kirim link hasilnya, (b) link Claude Design yang sudah ada, (c) screenshot/gambar desain ke `context/designs/`, (d) link Figma/website referensi, atau (e) izin eksplisit untuk build hanya berdasarkan ui-rules.md + ui-tokens.md."*
   - Jalur Claude Design (prompt → link → snapshot di `context/designs/` → token) ada di `context/ui-workflow.md`.
   - Baru lanjut setelah user menjawab.
4. Setelah component selesai dibuat → **update `context/ui-registry.md`** (nama, path, kelas yang dipakai).

Detail lengkap ada di `context/ui-workflow.md`. Aturan ini berlaku juga saat user memberi perintah singkat seperti "buatkan halaman login" — tetap cek referensi dulu.

### 2. Scope adalah hal sakral

Kerjakan **hanya** apa yang diminta pada feature yang sedang aktif di `build-plan.md`. Jangan menambah fitur, refactor di luar scope, atau "sekalian memperbaiki" hal lain tanpa persetujuan.

### 3. Satu feature sampai tuntas

Selesaikan satu feature sepenuhnya (termasuk bisa diverifikasi secara visual/fungsional) sebelum menyentuh feature berikutnya.

### 4. Update dokumen hidup

Setelah setiap feature selesai:
- Update `context/progress-tracker.md` (status, last completed, next)
- Update `context/ui-registry.md` jika ada component baru
- Catat keputusan penting di bagian *Decisions* pada progress-tracker

### 5. Jangan percaya training data untuk API library

NestJS, Next.js, Tailwind v4, BullMQ, dan ORM berubah cepat. Sebelum memakai API yang kamu tidak 100% yakin, baca `context/library-docs.md` dan/atau dokumentasi resmi terbaru. Jika ragu, katakan ragu — jangan mengarang API.

---

## Stack Project

| Layer | Tool |
| --- | --- |
| Backend API | **NestJS** (semua business logic, auth, RBAC) |
| Database | **PostgreSQL** — multi-tenant `tenant_id` + Row Level Security |
| ORM | Drizzle ORM + drizzle-kit |
| AI | Claude, di balik lapisan abstraksi provider |
| Storage & email | S3-compatible self-hosted · SMTP (dev: Mailpit) |
| Antrean | BullMQ + Redis (PDF, AI, WhatsApp, sync ERPNext) |
| Frontend | Next.js (App Router) — hanya UI, memanggil API NestJS |
| Styling | Tailwind CSS v4 (`@theme` di globals.css, TANPA tailwind.config untuk token) |
| UI primitives | shadcn/ui (opsional) |
| Monorepo | pnpm workspaces + Turborepo (`apps/api`, `apps/web`, `apps/worker`, `packages/*`) |
| Container | Docker Compose (api, web, worker, postgres, redis) |
| Uang | decimal.js + `numeric` Postgres — tidak pernah float |
| Bahasa | TypeScript strict mode |

**Tidak dipakai:** Supabase, Frappe/ERPNext sebagai engine.

Detail lengkap: `context/architecture.md`.

---

## Slash Commands yang Tersedia

| Command | Fungsi |
| --- | --- |
| `/build-ui` | Workflow membuat halaman/component — menegakkan aturan referensi desain |
| `/new-feature` | Workflow mengerjakan satu feature dari build-plan sampai tuntas |
| `/update-context` | Sinkronkan progress-tracker + ui-registry setelah kerja selesai |
| `/db-change` | Workflow perubahan schema database via migration (bukan edit langsung) |
| `/plan-app` | Wawancara terstruktur untuk mengisi project-overview + build-plan |

---

## Gaya Komunikasi

- Bahasa Indonesia, istilah teknis boleh tetap Inggris
- Ringkas dan langsung. Jangan basa-basi, jangan validasi kosong
- Jika permintaan user secara teknis salah arah atau ada cara yang lebih baik/aman, katakan SEBELUM mengerjakan
- Jika informasi penting kurang, tanyakan maksimal 1–2 hal — jangan menebak pada hal yang berisiko (schema, auth, data user)

---

## Yang TIDAK BOLEH Dilakukan

- Generate UI tanpa melewati checklist referensi desain
- Reset/drop database atau perintah destruktif lain tanpa konfirmasi user
- Menulis SQL langsung ke database production — semua perubahan schema lewat file migration
- Hardcode secret/API key di kode — semua lewat `.env`
- Memakai float/`number` untuk uang, hardcode aturan regulasi (TER, BPJS, UMK), atau melewati RLS
- Menaruh business logic di `apps/web` atau di controller NestJS
- Membiarkan skor/ringkasan AI menjadi final tanpa review atasan
- Memakai `any` di TypeScript
- Memakai warna Tailwind bawaan (`bg-blue-500`) — hanya token dari `ui-tokens.md`
- Membuat file baru di luar struktur folder yang ditetapkan `architecture.md`
