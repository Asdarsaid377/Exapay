# ExaPayroll — NestJS + PostgreSQL + Next.js (Tailwind v4)

Starter kit **context system** untuk membangun aplikasi bersama Claude Code dengan disiplin senior engineer. Terinspirasi pola [jsm-agent-skill](https://github.com/jsmastery-pro/jsm-agent-skill), diadaptasi ke Bahasa Indonesia, Claude Code (`CLAUDE.md` + slash commands), untuk stack NestJS + PostgreSQL + Next.js.

Starter ini **bukan boilerplate kode** — ini adalah kerangka context + workflow yang membuat Claude Code bekerja konsisten antar session dan antar project, selama bertahun-tahun.

---

## Struktur

```
/
├── CLAUDE.md                       → Entry point Claude Code (aturan non-negotiable)
├── .claude/commands/
│   ├── build-ui.md                 → /build-ui — UI wajib pakai referensi desain
│   ├── new-feature.md              → /new-feature — kerjakan 1 feature sampai tuntas
│   ├── db-change.md                → /db-change — perubahan schema via migration
│   └── update-context.md           → /update-context — sinkron dokumen hidup
├── context/
│   ├── project-overview.md         → [ISI PER PROJECT] apa yang dibangun
│   ├── architecture.md             → [SESUAIKAN] stack + struktur folder + data flow
│   ├── code-standards.md           → Konvensi kode (TS strict, Next.js, penamaan)
│   ├── database-standards.md       → Postgres, RLS multi-tenant, auth, uang, migration, BullMQ
│   ├── ui-workflow.md              → GERBANG UI: tanpa referensi desain = tidak ada UI
│   ├── ui-rules.md                 → [SESUAIKAN] pola visual (layout, card, button)
│   ├── ui-tokens.md                → [SESUAIKAN] design tokens @theme Tailwind v4
│   ├── ui-registry.md              → Dokumen hidup: daftar component yang sudah ada
│   ├── library-docs.md             → Catatan API library + area rawan halusinasi
│   ├── build-plan.md               → [ISI PER PROJECT] fase & feature berurutan
│   ├── progress-tracker.md         → Dokumen hidup: status build
│   └── designs/                    → Taruh referensi desain (png/jpg) di sini
├── apps/ (api, web, worker)        → Dibuat di feature 01
└── packages/db/migrations/         → Semua perubahan schema
```

---

## Cara Pakai untuk Project Baru

1. **Copy seluruh folder ini** sebagai root project baru
2. **Isi 4 file template** (cari tanda `[ISI]` / `[SESUAIKAN]`):
   - `context/project-overview.md` — wajib pertama
   - `context/build-plan.md`
   - `context/architecture.md` (stack tambahan per project)
   - `context/ui-tokens.md` + `context/ui-rules.md` (setelah desain ada)
3. **Taruh referensi desain** di `context/designs/` — tanpa ini Claude Code akan menolak membuat UI
4. Buka Claude Code di root project, mulai dengan:
   ```
   /new-feature 01
   ```

Tip: kalau overview/build-plan belum ada, minta Claude Code menyusunnya lewat tanya-jawab — dia diinstruksikan berhenti jika file masih placeholder.

## Cara Kerja Sistem Ini

- **CLAUDE.md** dibaca otomatis Claude Code tiap session — berisi aturan non-negotiable dan urutan baca context
- **Dokumen hidup** (`progress-tracker.md`, `ui-registry.md`) adalah "memori" antar session — wajib di-update tiap selesai kerja (`/update-context`)
- **Gerbang UI** (`ui-workflow.md` + `/build-ui`) memastikan Claude selalu minta referensi visual sebelum generate halaman/component
- **Database** punya standarnya sendiri (`database-standards.md`) — RLS multi-tenant wajib, semua schema lewat migration, perintah destruktif butuh konfirmasi
# claude-context-kit
# Exapay
