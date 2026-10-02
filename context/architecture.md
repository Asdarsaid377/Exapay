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
├── docker-compose.prod.yml           → production satu VPS (caddy, api, web, worker, postgres, redis, storage, migrate, backup)
├── .env.production.example           → template env production (salinan asli `.env.production` tidak di-commit)
├── docker/postgres/init/             → script init: role app_owner & app_user (dev & production)
├── docker/production/                → Dockerfile multi-target, Caddyfile, SeaweedFS start.sh, image backup (restic), uji restore, README runbook deploy
├── pnpm-workspace.yaml
├── turbo.json
├── apps/
│   ├── api/                          → NestJS
│   │   ├── test/                     → test integrasi (vitest) terhadap database test terpisah
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── app.setup.ts          → konfigurasi HTTP bersama (cookie-parser, filter) untuk main.ts & test e2e
│   │       ├── common/               → guard, interceptor, filter, decorator bersama
│   │       │   ├── auth/             → JwtAuthGuard, RolesGuard (global), @Public, @Roles, @SuperAdmin, @CurrentUser
│   │       │   ├── validation/       → ZodValidationPipe
│   │       │   ├── crypto/           → FieldCipher (AES-256-GCM kolom sensitif + blind index HMAC), CryptoModule global
│   │       │   ├── filters/          → AllExceptionsFilter → { success: false, error }
│   │       │   └── config/           → skema env (zod) untuk ConfigModule
│   │       ├── database/             → koneksi DB + helper transaksi ber-tenant (withTenant/withUser, TenantContext), errors.ts
│   │       ├── redis/                → koneksi Redis global (health) + produsen antrean BullMQ `AI_QUEUE` (feature 23)
│   │       ├── scripts/              → seed-dev.ts (`db:seed`), create-super-admin.ts (`admin:create-super-admin`)
│   │       └── modules/              → satu folder per domain
│   │           ├── auth/
│   │           ├── email/            → abstraksi pengirim email (SMTP)
│   │           ├── invitations/      → undangan bergabung ke tenant (buat, lookup, terima) — dipakai tenants & users
│   │           ├── tenants/          → panel super-admin (/admin/tenants), data bawaan tenant baru
│           ├── users/            → pengguna & undangan usaha aktif (/users — owner/admin, feature 08)
│           ├── company/          → profil usaha aktif (/company — owner/admin, feature 09)
│           ├── regions/          → referensi provinsi & kabupaten/kota Kemendagri (/regions, data platform)
│           ├── regulations/      → data regulasi berlaku-tanggal (BPJS, TER, Pasal 17, PTKP, biaya jabatan, UMP/UMK) — RegulationsService.forDate/minimumWage, tanpa endpoint (feature 24)
│           ├── organization/     → departemen & jabatan (/organization, feature 10)
│   │           ├── employees/        → data karyawan (/employees, feature 11) + impor Excel (employee-import.*: parser, template, service, controller — feature 12)
│   │           ├── attendance/       → absensi (/attendance): jadwal kerja & hari libur + hitung hari kerja (work-calendar.ts murni, WorkCalendarService diekspor — feature 13); absen masuk/pulang milik sendiri /attendance/me (my-attendance.controller, attendance.service, attendance-clock.ts murni — feature 14); pengajuan izin/sakit/cuti /attendance/me/leave-requests + persetujuan /attendance/leave-requests (leave-requests.service, my-leave-requests.controller, leave-requests.controller, leave-attachment.ts murni — feature 15; rekap /attendance/recap + koreksi /attendance/corrections (attendance-recap.ts murni, attendance-recap.service/controller, attendance-corrections.service/controller, attendance-viewer.ts cakupan penglihat — feature 16))
│   │           ├── storage/          → abstraksi FileStorage (put/get/remove) + S3FileStorage (SeaweedFS), StorageModule global; key `tenants/<tenant_id>/…`, bucket dibuat saat start (feature 15)
│   │           ├── tasks/            → log tugas harian /tasks/me + foto /tasks/logs/:id/photo (task-logs.service, my-task-logs.controller, task-logs.controller, task-log-rules.ts murni — feature 19)
│   │           ├── kpi/              → template KPI per jabatan /kpi/templates (kpi-templates.service/controller, kpi-builtin-templates.ts data bawaan + seed — feature 18); skor ad-hoc /kpi/scores + /kpi/scores/me (kpi-score.ts murni, kpi-scores.service/controller — feature 21); siklus /kpi/settings + penilaian periodik /kpi/reviews (kpi-review-periods.ts murni, kpi-reviews.service/controller — feature 22); ringkasan AI /kpi/reviews/:id/summary (kpi-review-summary.ts, kpi-review-summaries.service/controller — feature 23)
│   │           ├── payroll/          → komponen gaji (feature 28): katalog /salary-components + kelompok risiko JKK (salary-components.service/controller, salary-builtin-components.ts data bawaan + seed), gaji karyawan berlaku-tanggal /employees/:id/salary (employee-salaries.service/controller), salary-access.ts (owner/admin); run payroll draf /payroll/runs (payroll-draft.ts murni → payroll-engine, payroll-runs.service/controller — feature 29)
│   │           ├── compliance/       → kalender kepatuhan /compliance (compliance.service/controller — pengingat dari fungsi murni @exapay/shared compliance.ts, feature 33)
│   │           ├── dashboard/        → ringkasan owner/admin GET /dashboard (dashboard.service/controller — merangkai service rekap absensi, skor KPI, periode gaji, kepatuhan; feature 35)
│   │           └── audit/
│   ├── worker/                       → Proses BullMQ (NestJS standalone app)
│   │   └── src/
│   │       ├── config/               → skema env worker (zod): REDIS_URL, DATABASE_URL, ANTHROPIC_API_KEY, AI_MODEL
│   │       ├── database/             → pool Postgres app_user + Drizzle (withTenant dari @exapay/db, tenant dari payload job)
│   │       ├── ai/                   → lapisan abstraksi provider AI: AiProvider, AnthropicAiProvider (Claude), FakeAiProvider (dev), prompt berversi (feature 23)
│   │       ├── scripts/              → run-compliance-scan.ts (`compliance:scan` — pemindaian kepatuhan manual, feature 33)
│   │       └── processors/           → kpi-review-summary (feature 23), payslip (feature 31), compliance (job terjadwal email H-7/H-1, feature 33); whatsapp, erp-sync menyusul
│   └── web/                          → Next.js
│       ├── app/
│       │   ├── globals.css           → Import Tailwind + @theme tokens
│       │   ├── layout.tsx
│       │   ├── (auth)/login/page.tsx
│       │   ├── (main)/layout.tsx     → AppShell (sidebar) area owner/admin/atasan
│       │   ├── (main)/dashboard/page.tsx
│       │   ├── (main)/[...slug]/     → "Segera hadir" untuk menu yang belum dibangun (selain itu 404)
│       │   ├── (portal)/layout.tsx   → PortalShell (bottom nav) portal karyawan
│       │   ├── (portal)/me/[...slug]/ → "Segera hadir" portal
│       │   ├── (portal)/me/page.tsx, me/attendance/ → kartu absen & riwayat absensi (feature 14) + pengajuan izin (feature 15; requests/[id]/attachment/route.ts buka lampiran)
│       │   ├── (main)/attendance/requests/ → persetujuan izin/sakit/cuti (feature 15; [id]/attachment/route.ts buka lampiran)
│       │   ├── (main)/attendance/ → rekap per periode (page.tsx) + corrections/ koreksi owner/admin (feature 16)
│       │   ├── (admin)/layout.tsx    → AppShell panel super-admin (menu ADMIN_MENU)
│       │   ├── (admin)/admin/tenants/ → daftar & detail tenant
│       │   ├── (auth)/invite/[token]/ → terima undangan
│       │   ├── (main)/settings/users/ → pengguna & undangan usaha (feature 08)
│       │   ├── (main)/settings/company/ → profil usaha (feature 09)
│       │   ├── (main)/organization/ → departemen & jabatan (feature 10)
│       │   ├── (main)/employees/ → daftar, tambah (new), detail [id] karyawan (feature 11), impor (import/ + import/template/route.ts unduh template — feature 12)
│       │   ├── (main)/settings/attendance/ → jadwal kerja & hari libur (feature 13; aturan potongan menyusul feature 17)
│       │   ├── (main)/kpi/templates/ → daftar, tambah/salin (new/?from=), ubah [id] template KPI (feature 18)
│       │   ├── (portal)/me/tasks/  → log tugas harian (feature 19; [id]/photo/route.ts buka foto bukti)
│       │   ├── (main)/kpi/scores/ → skor KPI ad-hoc per karyawan/tim (feature 21)
│       │   ├── (portal)/me/performance/ → skor KPI milik sendiri per bulan (feature 21)
│       │   ├── (main)/kpi/reviews/ → penilaian periodik per periode + detail [id] (feature 22)
│       │   ├── (main)/settings/kpi/ → siklus penilaian KPI (feature 22)
│       │   ├── (main)/settings/salary-components/ → katalog komponen gaji & kelompok risiko JKK (feature 28); gaji per karyawan = tab Gaji di employees/[id]
│       │   ├── (main)/compliance/ → kalender kepatuhan (feature 33)
│       │   ├── (main)/dashboard/ → dashboard owner/admin + loading.tsx (feature 35; versi atasan feature 36)
│       │   ├── (main)/payroll/ → periode gaji (page.tsx), draf [id], rincian & penyesuaian [id]/employees/[employeeId] (feature 29), slip gaji [id]/slips + PDF [id]/slips/[payslipId]/pdf (feature 31), laporan reports + unduh Excel reports/[runId]/transfer|contributions (feature 32); portal (portal)/me/payslips + PDF [id]/pdf
│       │   └── error.tsx             → gangguan server (mis. API tidak terjangkau) — sesi TIDAK diakhiri, tombol coba lagi
│       ├── components/
│       │   ├── ui/                   → shadcn/ui primitives saja
│       │   ├── common/               → komponen dasar lintas fitur (Button, TextField, TextAreaField, SelectField, Combobox, FileDropzone, SegmentedControl, FormSection, Banner, DropdownMenu, EmptyState, Badge, StatTile, Dialog, Pagination)
│       │   ├── layout/               → AppShell, SidebarNav, PortalShell, header (TenantSwitcher, UserMenu), PageHeader
│       │   └── <fitur>/              → Component per fitur
│       ├── public/images/            → aset gambar statis (mis. foto halaman auth)
│       ├── actions/                  → Server Action tipis (validasi ulang → API → teruskan cookie): auth.ts, adminTenants.ts, invitations.ts, users.ts, company.ts, organization.ts, employees.ts, workCalendar.ts, attendance.ts, leaveRequests.ts, attendanceCorrections.ts, attendanceDeductions.ts, kpiTemplates.ts, taskLogs.ts, taskVerification.ts, kpiReviews.ts, salary.ts, payrollRuns.ts
│       ├── lib/
│       │   ├── api/                  → Client pemanggil API NestJS (server.ts) + fetcher per fitur (adminTenants.ts, users.ts, company.ts, organization.ts, employees.ts, workCalendar.ts, attendance.ts, leaveRequests.ts, attendanceRecap.ts, kpiTemplates.ts, taskLogs.ts, kpiScores.ts, kpiReviews.ts, salary.ts, payrollRuns.ts, compliance.ts, dashboard.ts, …)
│       │   ├── auth/                 → klaim sesi untuk routing, parser Set-Cookie, getSession
│       │   ├── geolocation.ts        → lokasi browser saat absen (tidak memblokir)
│       │   └── navigation.ts         → definisi menu per peran (sidebar, bottom nav, guard proxy)
│       └── proxy.ts                  → Proteksi route + refresh sesi otomatis (Next 16: pengganti middleware.ts)
├── packages/
│   ├── shared/                       → zod schema, DTO type, enum (role, status) — dipakai api & web
│   ├── payroll-engine/               → Perhitungan gaji MURNI: tanpa NestJS, tanpa DB, + unit test
│   └── db/                           → Schema Drizzle + migration (drizzle-kit) + helper transaksi ber-tenant `withTenant`/`withUser` (src/tenant-transaction.ts, dipakai api & worker sejak feature 23)
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
- **Prinsip:** semua infrastruktur self-hosted di VPS user; pihak ketiga di MVP hanya SMTP relay (production), API Claude, dan penyimpanan backup S3 eksternal (Cloudflare R2/B2 — hanya menerima data terenkripsi restic)
- **Production (feature 38):** satu VPS, `docker-compose.prod.yml`. Caddy (HTTPS otomatis) satu domain: `/api/*` → NestJS (prefix dibuang, untuk client mobile), lainnya → Next.js standalone. Hanya Caddy yang membuka port; service lain di jaringan Docker. API `TRUST_PROXY_HOPS=1` (IP klien untuk rate limit auth). Runbook: `docker/production/README.md`
- **Backup:** service `backup` — pg_dump + mirror bucket storage → restic (terenkripsi) → S3 eksternal, harian + retensi + `restic check`. Uji restore ke instance terpisah: `docker/production/restore-test.sh`
- **Migration:** dijalankan lewat drizzle-kit (koneksi `DATABASE_MIGRATION_URL`), dari CI atau manual terkontrol — tidak pernah SQL copy-paste ke production
- Belum perlu Kubernetes
