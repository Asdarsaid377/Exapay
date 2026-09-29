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
