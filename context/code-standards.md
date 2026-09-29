# Code Standards

Aturan implementasi dan konvensi untuk seluruh project. Claude Code wajib mengikuti ini di setiap session tanpa pengecualian. Tujuannya mencegah *pattern drift* antar session.

---

## Mindset Engineering

Claude Code di project ini beroperasi sebagai senior engineer:

- **Berpikir sebelum implement** — pahami apa yang dibangun dan kenapa, sebelum menulis satu baris pun
- **Baca context files dulu** — jangan berasumsi; verifikasi ke `architecture.md` dan `project-overview.md`
- **Scope itu sakral** — hanya build apa yang dibutuhkan feature saat ini. Jangan melebar meskipun terasa "membantu"
- **Setiap feature harus bisa diverifikasi** — kalau tidak bisa dites/dilihat langsung setelah implement, berarti belum selesai
- **Clean over clever** — kode sederhana yang bisa dibaca junior developer selalu lebih baik daripada abstraksi pintar
- **Satu hal dalam satu waktu** — selesaikan satu feature penuh sebelum menyentuh yang lain
- **Kegagalan itu normal** — bungkus operasi eksternal dengan try/catch, log kegagalannya, jangan biarkan satu kegagalan meruntuhkan semuanya

---

## TypeScript

- Strict mode aktif di `tsconfig.json` — tanpa pengecualian
- Dilarang `any` — pakai `unknown` lalu narrow type-nya
- Dilarang type assertion (`as SomeType`) kecuali benar-benar perlu dan diberi komentar alasannya
- Semua parameter fungsi dan return type diketik eksplisit
- Pakai `type` untuk object shape dan union; `interface` hanya untuk component props yang perlu di-extend
- Semua async function wajib punya error handling — jangan biarkan promise mengambang
- `const` by default; `let` hanya jika memang perlu reassignment
- Type database di-generate oleh tool ORM, bukan ditulis manual
- Type & zod schema yang dipakai api dan web ditaruh di `packages/shared` — jangan diduplikasi

---

## Konvensi NestJS (apps/api, apps/worker)

- Satu domain = satu module di `src/modules/<domain>/` berisi `*.module.ts`, `*.controller.ts`, `*.service.ts`
- **Controller tipis:** terima request, validasi, panggil service, bentuk response. Tidak ada business logic / query di controller
- **Service** berisi business logic dan akses DB (lewat helper transaksi ber-tenant dari `src/database/`)
- Perhitungan gaji tidak ditulis di service — service memanggil `packages/payroll-engine`
- Validasi input di boundary dengan zod schema dari `packages/shared` (lewat pipe validasi)
- `JwtAuthGuard` + `RolesGuard` terdaftar **global** (`APP_GUARD` di `AuthModule`): semua endpoint wajib login secara default. Endpoint publik ditandai eksplisit `@Public()`; peran dibatasi dengan `@Roles(...)` (otomatis menolak user yang belum memilih tenant)
- Tenant & user diambil dari request yang sudah terautentikasi (`@CurrentUser()`), tidak dari body
- Pekerjaan lambat/eksternal → enqueue BullMQ, jangan dikerjakan di request
- Error ditangani lewat exception filter global: log detail di server, kirim pesan aman ke client

```typescript
// apps/api/src/modules/employees/employees.controller.ts
@Controller("employees") // guard auth & peran berlaku global
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles("owner", "admin")
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeInput,
  ): Promise<ApiResponse<Employee>> {
    // Service membuka withTenant(db, tenantContextOf(user), ...)
    const employee = await this.employeesService.create(user, body);
    return { success: true, data: employee };
  }
}
```

- Bentuk response konsisten: `{ success: boolean, data?, error? }`
- Log error dengan prefix `[modul/aksi]`
- Jangan pernah mengembalikan raw error / stack trace ke client
- API NestJS berubah antar major version — verifikasi dokumentasi resmi untuk API yang tidak 100% yakin

---

## Konvensi packages/payroll-engine

- Fungsi murni: input eksplisit (data karyawan, komponen, aturan regulasi yang berlaku) → output eksplisit (rincian per komponen)
- Tidak ada I/O, tidak ada `Date.now()` tersembunyi — tanggal periode dikirim sebagai input
- Semua uang pakai `decimal.js`; tidak ada operasi aritmatika pada `number` untuk uang
- Setiap aturan (BPJS, lembur, PPh 21 TER, true-up Desember) punya unit test dengan banyak skenario, termasuk batas upah dan pembulatan
- Hasil harus bisa dijelaskan: sertakan rincian langkah perhitungan di output

---

## Konvensi Next.js (apps/web, App Router)

- `apps/web` hanya UI: tidak ada business logic, tidak ada akses DB/Redis
- App Router only — tidak ada Pages Router
- Semua component adalah **Server Component by default**
- `"use client"` hanya jika component butuh state, browser API, event listener, atau library client-only
- Jangan menambahkan `"use client"` ke file layout kecuali benar-benar wajib
- Data fetching di Server Component lewat `lib/api/server.ts` (meneruskan cookie sesi ke NestJS)
- Mutasi: Server Action di `apps/web/actions/` yang **hanya meneruskan** ke API, lalu `revalidatePath`; atau fetch dari Client Component lewat `lib/api/client.ts`
- Validasi form di client memakai zod schema yang sama dari `packages/shared` (validasi final tetap di API)
- **API Next.js berubah antar versi** (caching, `cookies()`, `params` async) — verifikasi ke dokumentasi resmi

---

## Penamaan File dan Folder

- Folder: kebab-case — `job-details`, `user-settings`
- File NestJS: kebab-case dengan suffix peran — `employees.controller.ts`, `employees.service.ts`, `employees.module.ts`, `create-employee.dto.ts`
- File component React: PascalCase — `StatsBar.tsx`, `RecentActivity.tsx`
- File utility: camelCase — `formatDate.ts`, `posthogClient.ts`
- File Server Action (apps/web): camelCase — `employees.ts`
- Satu component per file — jangan export beberapa component dari satu file
- Index/barrel file hanya di `components/ui/` dan entry point `packages/*` — folder lain dilarang barrel export

---

## Struktur Component

Setiap component mengikuti urutan ini:

```typescript
"use client"; // hanya jika perlu

// 1. External imports
import { useState } from "react";

// 2. Internal imports
import { Button } from "@/components/ui/button";
import { StatsCard } from "@/components/dashboard/StatsCard";

// 3. Type definitions
type Props = {
  jobId: string;
  matchScore: number;
};

// 4. Component
export function ComponentName({ jobId, matchScore }: Props) {
  // state
  // derived values
  // handlers
  // return JSX
}
```

- Named export selalu — dilarang default export (pengecualian: `page.tsx`, `layout.tsx`, dan file lain yang diwajibkan default export oleh Next.js)
- Type props didefinisikan tepat di atas component — bukan file terpisah, kecuali dipakai bersama
- Tanpa inline style — semua styling via kelas Tailwind memakai token dari `ui-tokens.md`

---

## Error Handling & UX

- Jangan tampilkan raw error ke user — selalu pesan human-readable Bahasa Indonesia
- Setiap operasi async di UI punya 3 state: loading, success, error
- Setiap list punya empty state (lihat `ui-rules.md`)

---

## Git

- Commit message: bahasa Inggris, imperative — `add profile form validation`
- Satu commit = satu perubahan logis
- Jangan commit: `.env*` (kecuali `.env.example`), folder build (`dist`, `.next`, `.turbo`), `node_modules`
