import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type * as schema from "./schema.js";

// Dipakai bersama apps/api dan apps/worker (feature 23): semua query data tenant lewat withTenant agar RLS berlaku.
export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Konteks dari sesi yang SUDAH diverifikasi — tidak pernah dari body/query param request.
// userId null untuk proses sistem (mis. job worker) yang bertindak atas nama tenant.
export type TenantContext = {
  tenantId: string;
  userId: string | null;
};

async function withContext<T>(
  db: Database,
  tenantId: string | null,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., true) hanya berlaku di transaksi ini, jadi aman terhadap connection pool
    await tx.execute(
      sql`select set_config('app.tenant_id', ${tenantId ?? ""}, true), set_config('app.user_id', ${userId ?? ""}, true)`,
    );
    return fn(tx);
  });
}

// Jalankan fn di dalam satu transaksi dengan konteks tenant untuk RLS.
export async function withTenant<T>(
  db: Database,
  ctx: TenantContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return withContext(db, ctx.tenantId, ctx.userId, fn);
}

// Konteks user tanpa tenant aktif: hanya data milik user sendiri (profil, membership, refresh token).
// Dipakai auth sebelum tenant dipilih — bukan untuk data bisnis tenant.
export async function withUser<T>(db: Database, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return withContext(db, null, userId, fn);
}
