import * as schema from "@exapay/db";
import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Konteks dari sesi yang SUDAH diverifikasi — tidak pernah dari body/query param request.
// userId null untuk proses sistem (mis. job worker) yang bertindak atas nama tenant.
export type TenantContext = {
  tenantId: string;
  userId: string | null;
};

// Jalankan fn di dalam satu transaksi dengan konteks tenant untuk RLS.
// set_config(..., true) hanya berlaku di transaksi ini, jadi aman terhadap connection pool.
export async function withTenant<T>(
  db: Database,
  ctx: TenantContext,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.tenant_id', ${ctx.tenantId}, true), set_config('app.user_id', ${ctx.userId ?? ""}, true)`,
    );
    return fn(tx);
  });
}
