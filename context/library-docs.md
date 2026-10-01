# Library Docs

Catatan referensi library yang dipakai project ini. Tujuan file ini: mencegah Claude Code mengarang API dari training data yang usang.

**Aturan utama:** Jika kamu (Claude Code) tidak 100% yakin dengan sebuah API — signature-nya, nama package-nya, perilakunya di versi yang terpasang — **jangan menebak.** Cek `package.json` untuk versi terpasang, lalu baca dokumentasi resmi (via WebFetch/WebSearch bila tersedia) atau baca langsung type definition di `node_modules`.

---

## Area yang Paling Sering Berubah (WASPADA)

### Next.js
- **Next 16: `middleware.ts` diganti `proxy.ts`** dengan export `proxy` (runtime Node). Docs versi terpasang ada di `node_modules/next/dist/docs/`
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
- **Pola:** `globalSetup` mengembalikan fungsi teardown; data dari setup ke test lewat `project.provide(key, value)` + `inject(key)` dengan augmentasi `declare module "vitest" { interface ProvidedContext }`. `setupFiles` (`test/setup-env.ts`) mengarahkan `DATABASE_URL` ke DB test sebelum `AppModule` di-import. `fileParallelism: false` (semua file berbagi satu DB test)
- **Gotcha:** Vite 8 (transformer oxc) meng-emit decorator metadata dari tsconfig (`emitDecoratorMetadata`) → DI NestJS jalan di vitest **tanpa** `unplugin-swc`

### Auth API — @nestjs/jwt (v12.0.2), @node-rs/argon2 (v2.2.1), cookie-parser (v1.4.7)
- **Pola:** `JwtModule.register({})` tanpa secret global; secret + `algorithm: "HS256"` diberikan per `signAsync`/`verifyAsync` (access & refresh beda secret). `verifyAsync` selalu dengan `algorithms: ["HS256"]`
- **Gotcha:** `@node-rs/argon2` dipilih (bukan `argon2`) karena binary prebuilt per platform lewat optional dependency — tanpa build script, jalan di Alpine (musl). `import cookieParser from "cookie-parser"` (default import CJS)

### nodemailer (v10.0.12) + @types/nodemailer (v8)
- **Dipakai untuk:** implementasi `EmailTransport` SMTP di `modules/email` (dev: Mailpit `localhost:1025`, UI/API `localhost:8025`)
- **Gotcha:** tipe dari `@types/nodemailer` 8 (paket tidak membawa tipe sendiri). Auth SMTP hanya dipasang jika `SMTP_USER` & `SMTP_PASSWORD` terisi

### supertest (v7.3) + @nestjs/testing (v12.1)
- **Pola:** test e2e membuat app dari `AppModule` + controller uji (`ProbeController`) lalu `configureApp(app)` — sama dengan `main.ts`. `request.agent(server)` untuk alur cookie

### Auth web (feature 04) — pola cookie
- Browser hanya berbicara dengan web; web meneruskan cookie sesi ke API (`Cookie` header) lewat `lib/api/server.ts`, dan meneruskan `Set-Cookie` dari API ke browser: di Server Action pakai `(await cookies()).set/delete`, di `proxy.ts` pakai `response.cookies.set` + `request.cookies.set` lalu `NextResponse.next({ request: { headers: request.headers } })` agar Server Component pada request yang sama melihat token baru
- `response.headers.getSetCookie()` (fetch Node) untuk membaca banyak Set-Cookie
- `next.config.ts` hanya mengambil `API_INTERNAL_URL` dari `.env` root (`node:util` `parseEnv`) — secret API/DB tidak dimuat ke proses Next
- Klaim JWT di web dibaca **tanpa verifikasi**, hanya untuk memilih halaman; otorisasi tetap di API

### read-excel-file (v9.3) + write-excel-file (v4.1) + fflate (v0.8) — impor karyawan (feature 12)
- Import `read-excel-file/node` & `write-excel-file/node` (paket ESM, subpath wajib). `readXlsxFile(buffer, { parseNumber })` → `[{ sheet, data }]`; sel tanggal → `Date` UTC, string otomatis di-trim, baris kosong tetap ada. `parseNumber: (s) => ({ numeric: s })` dipakai untuk membedakan sel angka dari teks.
- Error file: `InvalidInputError` (`code`: `XLS_FILE_NOT_SUPPORTED`, `NO_DATA`, `FILE_NOT_SUPPORTED`, …) dan `InvalidSpreadsheetError`.
- `writeXlsxFile(sheets[], options).toBuffer()`; sel `{ type: Date, value: undefined, format }` wajib punya `format` (atau `dateFormat` global). Sel kosong ber-`format` tetap ditulis (gaya sel). Tidak ada data validation bawaan → sisipkan `<dataValidations>` tepat setelah `</sheetData>` lewat `features[].files.transform["xl/worksheets/sheet{id}.xml"]`.
- `fflate.unzipSync(buf, { filter })` dengan filter `false` hanya membaca direktori zip — dipakai untuk menjumlah `originalSize` (cegah zip bomb).
- Upload NestJS: `FileInterceptor` dari `@nestjs/platform-express` (multer 2.x dibundel; tanpa `dest` = memory storage, `file.buffer`). `limits.fileSize` terlampaui → `PayloadTooLargeException` (413).


### bullmq (v6.3) — antrean (feature 23)
- **Dipakai untuk:** antrean `ai` — produsen di `apps/api` (`new Queue(name, { connection, defaultJobOptions })`), konsumen di `apps/worker` (`new Worker(name, processor, { connection, concurrency })`)
- **Pola:** `queue.add(jobName, data, { jobId })` untuk idempotensi; `job.attemptsMade` = jumlah percobaan gagal SEBELUM percobaan berjalan (percobaan terakhir: `attemptsMade + 1 >= opts.attempts`); `UnrecoverableError` = gagal tanpa retry. Test: `queue.getJob(id)`, `queue.obliterate({ force: true })`
- **Gotcha:** koneksi ioredis yang diberikan ke Queue/Worker dianggap *shared* — `close()` tidak menutupnya, tutup sendiri (`quit()`). Worker wajib `maxRetriesPerRequest: null`. Install memicu build script `msgpackr-extract` (opsional, ada fallback JS) → `allowBuilds.msgpackr-extract: false`

### @anthropic-ai/sdk (v0.129) — ringkasan AI (feature 23)
- **Dipakai untuk:** `AnthropicAiProvider` di `apps/worker/src/ai/`
- **Pola:** `client.beta.messages.create({ model, max_tokens, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "medium" }, system, messages })`; cek `stop_reason` (`refusal` → permanen, `max_tokens` → retry) sebelum membaca blok `text`; `response.model` = model yang benar-benar menjawab. Error: `AuthenticationError`/`PermissionDeniedError`/`NotFoundError`/`BadRequestError` permanen, `RateLimitError`/`InternalServerError`/`APIConnectionError` dicoba ulang. Model default `claude-opus-5` (Opus 5: thinking adaptif default, tanpa prefill, tanpa `budget_tokens`)
- **Gotcha:** jangan pakai `temperature`/`budget_tokens` di Opus 5 (400). Bentuk `fallbacks: "default"` wajib header `-2026-07-01` (bentuk array memakai `-2026-06-01`)

### @aws-sdk/client-s3 (v3.1142) — storage lampiran (feature 15)
- **Dipakai untuk:** `S3FileStorage` di `apps/api/src/modules/storage/` terhadap SeaweedFS (S3-compatible)
- **Pola:** `new S3Client({ endpoint, region, credentials, forcePathStyle: true, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" })`; `PutObjectCommand` / `GetObjectCommand` (`Body.transformToByteArray()`) / `DeleteObjectCommand` / `HeadBucketCommand` + `CreateBucketCommand`. Error layanan = `S3ServiceException` (`$metadata.httpStatusCode`)
- **Gotcha:** SDK ≥ 3.729 menambah checksum CRC32 bawaan di setiap request — dimatikan (`WHEN_REQUIRED`) agar kompatibel dengan server S3 non-AWS. pnpm 11 memasang versi yang lolos umur rilis minimum (3.1142, bukan 3.1143 terbaru)
- Upload multipart NestJS: `FileInterceptor("attachment", { limits })` — field teks multipart tetap masuk `@Body()` (string) dan divalidasi zod yang sama dengan form web. `originalname` dibaca multer sebagai latin1 → didekode ke UTF-8 di `leave-attachment.ts`
