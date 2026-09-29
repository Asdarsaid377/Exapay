# Architecture

> Sumber keputusan stack: `PROJECT_BRIEF.md` bagian 5–6. Jangan mengubah pola dasar di bawah tanpa alasan yang dicatat di `progress-tracker.md` bagian *Decisions*.

---

## Stack

| Layer | Tool | Keterangan |
| --- | --- | --- |
| Backend API | NestJS | Semua business logic, auth, RBAC, akses database |
| Database | PostgreSQL | Satu DB, satu schema, `tenant_id` + Row Level Security |
| ORM / query builder | Drizzle ORM + drizzle-kit | Transaksi + `set_config` per request untuk RLS; migration SQL di `packages/db` |
| Antrean / background job | BullMQ + Redis | PDF slip gaji, ringkasan AI, notifikasi WhatsApp, sync ERPNext |
| Frontend | Next.js (App Router) | Hanya UI — memanggil API NestJS, tidak mengakses database langsung |
| Styling | Tailwind CSS v4 | Token via `@theme` di `apps/web/app/globals.css` |
| UI primitives | shadcn/ui | Opsional per component |
| Validasi | zod | Schema dipakai bersama API dan web lewat `packages/shared` |
| Uang | decimal.js | Semua perhitungan uang. Tidak pernah float |
| AI | Claude (Anthropic) | Di balik lapisan abstraksi provider, dipanggil dari worker |
| File storage | S3-compatible self-hosted — **SeaweedFS** | Slip PDF, foto bukti tugas, lampiran izin, file impor |
| Email | SMTP (abstraksi) | Dev: Mailpit. Prod: SMTP relay tier gratis |
| Monorepo | pnpm workspaces + Turborepo | Tipe & validasi dipakai bersama |
| Container | Docker + Docker Compose | Dev: `api`, `web`, `worker`, `postgres`, `redis`, `mailpit`, storage S3 |
| Bahasa | TypeScript strict | Seluruh codebase |
| Test | Vitest / Jest (ikut default NestJS) | Wajib untuk `payroll-engine` |

**Tidak dipakai:** Supabase, Frappe/ERPNext sebagai engine (ERPNext hanya integrasi opsional lewat adapter).

---

## Struktur Folder (Monorepo)

```
/
├── CLAUDE.md
├── PROJECT_BRIEF.md
├── .claude/commands/
├── context/                          → Dokumen context
│   └── designs/                      → Referensi desain (png/jpg)
├── docker-compose.yml                → api, web, worker, postgres, redis, mailpit, storage (development)
├── Dockerfile                        → image dev bersama api/web/worker
├── docker/postgres/init/             → script init: role app_owner & app_user
├── pnpm-workspace.yaml
├── turbo.json
├── apps/
│   ├── api/                          → NestJS
│   │   ├── test/                     → test integrasi (vitest) terhadap database test terpisah
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── common/               → guard, interceptor, filter, decorator bersama
│   │       │   ├── auth/             → JwtAuthGuard, RolesGuard, @CurrentUser, @Roles
│   │       │   ├── tenant/           → TenantContext: set_config tenant per transaksi
│   │       │   └── config/           → skema env (zod) untuk ConfigModule
│   │       ├── database/             → koneksi DB + helper transaksi ber-tenant
│   │       ├── redis/                → koneksi Redis global (health, antrean)
│   │       └── modules/              → satu folder per domain
│   │           ├── auth/
│   │           ├── tenants/
│   │           ├── employees/
│   │           ├── tasks/
│   │           ├── kpi/
│   │           ├── payroll/
│   │           ├── compliance/
│   │           └── audit/
│   ├── worker/                       → Proses BullMQ (bisa NestJS standalone app)
│   │   └── src/processors/           → pdf, ai-summary, whatsapp, erp-sync
│   └── web/                          → Next.js
│       ├── app/
│       │   ├── globals.css           → Import Tailwind + @theme tokens
│       │   ├── layout.tsx
│       │   ├── (auth)/login/page.tsx
│       │   └── (main)/dashboard/page.tsx
│       ├── components/
│       │   ├── ui/                   → shadcn/ui primitives saja
│       │   ├── layout/               → Navbar, Sidebar
│       │   └── <fitur>/              → Component per fitur
│       ├── lib/
│       │   └── api/                  → Client pemanggil API NestJS (server.ts, client.ts)
│       └── middleware.ts             → Proteksi route (cek cookie sesi)
├── packages/
│   ├── shared/                       → zod schema, DTO type, enum (role, status) — dipakai api & web
│   ├── payroll-engine/               → Perhitungan gaji MURNI: tanpa NestJS, tanpa DB, + unit test
│   └── db/                           → Schema Drizzle + migration (drizzle-kit)
│       ├── src/schema.ts
│       ├── drizzle.config.ts
│       └── migrations/
├── .env.example
└── .env                              → Env asli (tidak di-commit)
```

Aturan:

- Business logic hanya di `apps/api` (service) atau `packages/payroll-engine` — tidak di controller, tidak di `apps/web`
- `apps/web` tidak pernah konek ke Postgres/Redis langsung
- `packages/payroll-engine` tidak boleh import NestJS, ORM, atau apapun yang menyentuh I/O
- Folder baru di luar struktur ini → catat alasannya di `progress-tracker.md`

---

## Data Flow

```
Baca data:
Browser → Next.js Server Component
  → lib/api/server.ts (fetch ke NestJS, meneruskan cookie sesi)
  → NestJS Controller → Guard (auth + role) → Service
  → transaksi DB dengan set_config('app.tenant_id', ..., true) → RLS menyaring baris
  → JSON { success, data } → render HTML

Mutasi:
Browser (form) → Server Action di apps/web (tipis, hanya meneruskan) atau fetch client
  → NestJS Controller → ValidationPipe (zod schema dari packages/shared)
  → Service → transaksi DB ber-tenant → audit log
  → response → revalidatePath di web

Background job:
Service → enqueue ke BullMQ (Redis)
  → apps/worker processor → hasil disimpan ke DB / file storage
  → status job bisa dipantau lewat API
```

### Multi-tenancy (WAJIB, dari brief)

- Semua tabel bisnis punya `tenant_id uuid not null`
- RLS enabled **dan** `FORCE ROW LEVEL SECURITY` di setiap tabel bisnis
- API konek memakai role Postgres non-superuser yang **bukan owner tabel** (agar RLS berlaku)
- Setiap request: buka transaksi → `select set_config('app.tenant_id', $1, true)` → query → commit
- Policy: `using (tenant_id = current_setting('app.tenant_id')::uuid)`
- Filter `where tenant_id = ...` di kode boleh sebagai tambahan, **tidak boleh** sebagai satu-satunya pengaman

Detail: `context/database-standards.md`.

---

## Environment & Deployment

- **Local/dev:** Docker Compose (`api`, `web`, `worker`, `postgres`, `redis`, `mailpit`, storage S3-compatible)
- **Prinsip:** semua infrastruktur self-hosted di VPS user; satu-satunya pihak ketiga di MVP adalah SMTP relay (production) dan API Claude
- **Production awal:** satu VPS, Docker Compose, reverse proxy (web dan api di domain yang sama agar cookie sesi sederhana, mis. `/api` → NestJS)
- **Backup:** pg_dump terjadwal ke penyimpanan di luar server — wajib sebelum ada data klien nyata
- **Migration:** dijalankan lewat drizzle-kit (koneksi `DATABASE_MIGRATION_URL`), dari CI atau manual terkontrol — tidak pernah SQL copy-paste ke production
- Belum perlu Kubernetes
