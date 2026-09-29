import { randomUUID } from "node:crypto";

import * as schema from "@exapay/db";
import { memberships, tenants, users } from "@exapay/db";
import type { MembershipRole } from "@exapay/shared";
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// Data dev untuk mencoba login per peran (akun langsung terverifikasi).
// Jalankan: pnpm --filter @exapay/api db:seed  — idempotent, hanya untuk development.
// Memakai role app_owner (DATABASE_MIGRATION_URL) karena flag super-admin hanya boleh di-set app_owner;
// RLS tetap berlaku (FORCE), jadi setiap insert dijalankan dengan konteks yang sesuai.

const DEV_PASSWORD = "password123";

type SeedUser = { email: string; fullName: string; superAdmin?: boolean; memberships: { tenant: string; role: MembershipRole }[] };

const TENANTS = ["Kopi Nusantara", "Toko Bangunan Sejahtera"];

const USERS: SeedUser[] = [
  { email: "owner@exapay.local", fullName: "Budi Pemilik", memberships: [{ tenant: "Kopi Nusantara", role: "owner" }] },
  { email: "admin@exapay.local", fullName: "Sari Admin", memberships: [{ tenant: "Kopi Nusantara", role: "admin" }] },
  { email: "atasan@exapay.local", fullName: "Andi Atasan", memberships: [{ tenant: "Kopi Nusantara", role: "atasan" }] },
  { email: "karyawan@exapay.local", fullName: "Dewi Karyawan", memberships: [{ tenant: "Kopi Nusantara", role: "karyawan" }] },
  {
    email: "multi@exapay.local",
    fullName: "Rudi Multi Usaha",
    memberships: [
      { tenant: "Toko Bangunan Sejahtera", role: "owner" },
      { tenant: "Kopi Nusantara", role: "karyawan" },
    ],
  },
  { email: "superadmin@exapay.local", fullName: "Super Admin Exapay", superAdmin: true, memberships: [] },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") throw new Error("[seed-dev] tidak boleh dijalankan di production");
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error("[seed-dev] DATABASE_MIGRATION_URL belum di-set");

  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });
  try {
    const { rows } = await db.execute<{ id: string }>(sql`select id from auth_find_user_by_email(${USERS[0]?.email ?? ""})`);
    if (rows.length > 0) {
      console.log("[seed-dev] data dev sudah ada — dilewati");
      return;
    }

    const passwordHash = await hash(DEV_PASSWORD);
    const userIds = new Map(USERS.map((u) => [u.email, randomUUID()]));
    const tenantIds = new Map(TENANTS.map((name) => [name, randomUUID()]));

    await db.transaction(async (tx) => {
      const setContext = (tenantId: string | null, userId: string | null) =>
        tx.execute(sql`select set_config('app.tenant_id', ${tenantId ?? ""}, true), set_config('app.user_id', ${userId ?? ""}, true)`);

      for (const user of USERS) {
        const id = userIds.get(user.email) ?? randomUUID();
        await setContext(null, id);
        await tx.insert(users).values({ id, email: user.email, fullName: user.fullName, passwordHash, isSuperAdmin: user.superAdmin ?? false, emailVerifiedAt: new Date() });
      }
      for (const [name, id] of tenantIds) {
        await setContext(id, null);
        await tx.insert(tenants).values({ id, name });
        for (const user of USERS) {
          for (const m of user.memberships.filter((x) => x.tenant === name)) {
            await tx.insert(memberships).values({ tenantId: id, userId: userIds.get(user.email) ?? "", role: m.role });
          }
        }
      }
    });

    console.log(`[seed-dev] selesai. Semua akun memakai password "${DEV_PASSWORD}":`);
    for (const user of USERS) {
      const roles = user.superAdmin ? "super-admin" : user.memberships.map((m) => `${m.role} @ ${m.tenant}`).join(", ");
      console.log(`  - ${user.email.padEnd(26)} ${roles}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("[seed-dev] gagal:", error);
  process.exit(1);
});
