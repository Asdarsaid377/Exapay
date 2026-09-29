# Library Docs

Catatan referensi library yang dipakai project ini. Tujuan file ini: mencegah Claude Code mengarang API dari training data yang usang.

**Aturan utama:** Jika kamu (Claude Code) tidak 100% yakin dengan sebuah API — signature-nya, nama package-nya, perilakunya di versi yang terpasang — **jangan menebak.** Cek `package.json` untuk versi terpasang, lalu baca dokumentasi resmi (via WebFetch/WebSearch bila tersedia) atau baca langsung type definition di `node_modules`.

---

## Area yang Paling Sering Berubah (WASPADA)

### Next.js
- `params` dan `searchParams` pada page: **async** di versi terbaru — harus di-`await`
- `cookies()` / `headers()`: async — harus di-`await`
- Perilaku caching berubah signifikan antar major version — verifikasi default caching pada versi terpasang sebelum mengandalkan asumsi
- Cek: https://nextjs.org/docs

### Tailwind CSS v4
- **Tidak ada** `tailwind.config.ts` untuk token — semua via `@theme` di CSS
- Setup: cukup `@import "tailwindcss";` di globals.css + plugin PostCSS `@tailwindcss/postcss`
- Sintaks lama v3 (`@tailwind base/components/utilities`) sudah tidak dipakai
- Cek: https://tailwindcss.com/docs

### NestJS
- Cek versi major terpasang sebelum memakai API yang tidak yakin (guard, pipe, `@nestjs/config`, `@nestjs/bullmq`)
- Integrasi BullMQ memakai package `@nestjs/bullmq` (bukan `@nestjs/bull` yang berbasis Bull lama)
- Validasi di project ini memakai zod (pipe custom), bukan class-validator — jangan mencampur keduanya
- Cek: https://docs.nestjs.com

### BullMQ + Redis
- Package `bullmq` (bukan `bull`). Konsep: Queue (enqueue), Worker (proses), job id untuk idempotensi
- Cek: https://docs.bullmq.io

### decimal.js
- Semua uang pakai `Decimal`. Dari DB (`numeric`) terima sebagai **string**, jangan biarkan driver mengubahnya ke `number`
- Atur rounding mode eksplisit sesuai aturan perhitungan; jangan andalkan default
- Cek: https://mikemcl.github.io/decimal.js/

### PostgreSQL RLS
- `set_config(name, value, true)` hanya berlaku di transaksi berjalan — wajib dipakai di dalam transaksi
- Owner tabel dan superuser mem-bypass RLS kecuali `FORCE ROW LEVEL SECURITY` — role runtime tidak boleh owner
- Cek: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

### Drizzle ORM + drizzle-kit
- ORM terpilih. API Drizzle berubah cukup cepat — cek versi terpasang dan dokumentasi resmi sebelum menulis pola transaksi & migration
- RLS policy, `FORCE ROW LEVEL SECURITY`, dan trigger ditulis sebagai custom SQL migration
- Cek: https://orm.drizzle.team/docs

### shadcn/ui
- Install per component via CLI (`npx shadcn@latest add button`) — bukan npm package monolitik
- Component hasil install adalah kode milik project — boleh dimodifikasi, dan modifikasi dicatat di `ui-registry.md`

---

## Catatan Per Library

> **TEMPLATE:** Setiap kali library baru ditambahkan ke project, tambahkan entry di sini: versi terpasang, pola pemakaian yang disepakati, dan jebakan (gotcha) yang ditemukan selama build.

### [nama-library] (v[x.y.z])

- **Dipakai untuk:** ...
- **Pola standar di project ini:** ...
- **Gotcha:** ...

### NestJS (v12.1.x) — `@nestjs/core`, `common`, `platform-express`, `config` 12
- **Dipakai untuk:** `apps/api` (HTTP) dan `apps/worker` (`NestFactory.createApplicationContext`)
- **Pola standar di project ini:** ESM (`"type": "module"`, tsconfig `module/moduleResolution: nodenext`, `experimentalDecorators` + `emitDecoratorMetadata`). Import relatif wajib berakhiran `.js`. Build `tsc -p tsconfig.build.json`, dev `tsc --watch` + `node --watch --env-file-if-exists=../../.env`. Env divalidasi `ConfigModule.forRoot({ validationSchema: zodSchema })` (Standard Schema; Joi tidak dipakai) dan dibaca `ConfigService<Env, true>.get(key, { infer: true })`
- **Gotcha:** NestJS tidak punya LTS — hanya major terbaru yang didukung (11 = tag `legacy`). Nest CLI 12 butuh Node ≥22.22.3/24.15. Butuh TypeScript ≥6 (jangan TS 7 dulu). API health indicator lama (`HealthIndicator`/`HealthCheckError`) dihapus di v12 — `/health` ditulis manual. Cek kompatibilitas v12 library pihak ketiga (mis. `@sentry/nestjs`) sebelum memasang

### TypeScript (~6.0.3)
- **Gotcha:** Base config di `tsconfig.base.json` (strict + `noUncheckedIndexedAccess`). `apps/api`/`worker` mematikan `isolatedModules` (decorator metadata). `apps/web` memakai `moduleResolution: bundler`

### ioredis (v6)
- **Dipakai untuk:** health check API, koneksi worker (kompatibel dengan peer dependency `bullmq` 6)
- **Pola:** `import { Redis } from "ioredis"` (named export). API: `maxRetriesPerRequest: 1, enableOfflineQueue: false` agar health cepat melapor down. Koneksi BullMQ wajib `maxRetriesPerRequest: null`

### pg (v8.23)
- **Dipakai untuk:** pool koneksi `PG_POOL` di `apps/api/src/database/` (feature 02 menambahkan Drizzle di atasnya)
- **Gotcha:** `import pg from "pg"` (default export di ESM), lalu `new pg.Pool(...)`

### Next.js (v16.3) + React 19.3 + Tailwind v4.3
- **Pola:** Turbopack default; `postcss.config.mjs` dengan `@tailwindcss/postcss`; font Inter via `next/font/google` dengan `variable: "--font-inter"` → token `--font-sans: var(--font-inter), ...`
- **Gotcha:** pnpm 11 menandai rilis next yang baru sebagai terlalu muda → otomatis menambah `minimumReleaseAgeExclude` di `pnpm-workspace.yaml`

### pnpm (v11.9) + Turborepo (v2.11)
- **Gotcha:** pnpm 11 punya kebijakan supply-chain (umur rilis minimum) — install bisa gagal/menambah pengecualian untuk paket yang baru rilis. Task `dev`/`typecheck`/`test` bergantung `^build` agar `packages/*` ter-compile ke `dist`

### Docker images (dev)
- `postgres:18-alpine` — **volume di `/var/lib/postgresql`** (bukan `/data`, berubah sejak PG 18). Script `docker-entrypoint-initdb.d` hanya jalan saat volume kosong
- `redis:8-alpine`, `axllent/mailpit:v1.31` (UI 8025, SMTP 1025)
- `chrislusf/seaweedfs:4.48` — `server -s3 -dir=/data`, S3 di port 8333. Kredensial via env `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` hanya berlaku jika tidak ada `-s3.config` (mode dev); format `-s3.config` = JSON `identities[].credentials[] + actions`
- `node:24-alpine` — `localhost` resolve ke `::1`; healthcheck pakai `127.0.0.1`

### Drizzle ORM (v0.45.3) + drizzle-kit (v0.31.11)
- **Dipakai untuk:** schema + migration (`packages/db`), query di `apps/api` lewat `drizzle({ client: pool, schema })` dari `drizzle-orm/node-postgres`
- **Pola:** extra config tabel mengembalikan **array** (`(t) => [index(...).on(...)]`). Tipe transaksi diturunkan: `Parameters<Parameters<Database["transaction"]>[0]>[0]`. Migrator programatik: `migrate(db, { migrationsFolder, migrationsSchema, migrationsTable })` dari `drizzle-orm/node-postgres/migrator`
- **Gotcha:** tag npm `beta`/`rc` = v1.0 (belum dipakai). drizzle-kit tidak membaca `.env` sendiri → `drizzle.config.ts` memanggil `process.loadEnvFile("../../.env")`. drizzle-kit tidak mendukung `FORCE ROW LEVEL SECURITY` → RLS ditulis SQL manual di migration. Error query dibungkus `DrizzleQueryError` — pesan asli pg ada di `error.cause`. Install memicu build script esbuild → diizinkan lewat `allowBuilds.esbuild: true` di `pnpm-workspace.yaml`

### Vitest (v4.1.11)
- **Dipakai untuk:** test integrasi `apps/api/test/` (RLS). Dipilih v4 (5.0 baru rilis 2026-09-25)
- **Pola:** `globalSetup` mengembalikan fungsi teardown; data dari setup ke test lewat `project.provide(key, value)` + `inject(key)` dengan augmentasi `declare module "vitest" { interface ProvidedContext }`
